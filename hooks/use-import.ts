"use client";

import { useState, useCallback } from "react";
import {
  collection,
  writeBatch,
  doc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Transaction } from "@/types/transaction";
import { FieldMapping, CSVAnalysis, AmountFormatConfig } from "@/types/import";
import { TransactionSource } from "@/types/source";
import { parseDate } from "@/lib/import/date-parsers";
import { parseAmount, getAmountParserConfig } from "@/lib/import/amount-parsers";
import {
  generateDedupeHash,
  checkDuplicatesBatch,
} from "@/lib/import/deduplication";
import { autoMatchColumns, validateMappings } from "@/lib/import/field-matcher";
import { parseCSV } from "@/lib/import/csv-parser";

const MOCK_USER_ID = "dev-user-123";
const BATCH_SIZE = 500; // Firestore batch limit

export type ImportStep = "upload" | "mapping" | "preview" | "importing" | "complete";

export interface ImportState {
  // Step is only used for transient states (importing, complete)
  // For navigable states, use URL params
  transientStep: "importing" | "complete" | null;
  file: File | null;
  analysis: CSVAnalysis | null;
  mappings: FieldMapping[];
  progress: number;
  results: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
  } | null;
  error: string | null;
}

export function useImport(source: TransactionSource | null) {
  const [state, setState] = useState<ImportState>({
    transientStep: null,
    file: null,
    analysis: null,
    mappings: [],
    progress: 0,
    results: null,
    error: null,
  });

  // Returns true when file is ready to proceed to mapping step
  const handleFileAnalyzed = useCallback(
    async (analysis: CSVAnalysis, file: File): Promise<boolean> => {
      setState((s) => ({
        ...s,
        file,
        analysis,
        error: null,
      }));

      // Check if source has saved mappings
      if (source?.fieldMappings) {
        // Use saved mappings
        const savedMappings = source.fieldMappings.mappings;
        const mappings: FieldMapping[] = analysis.headers.map((header) => ({
          csvColumn: header,
          targetField: savedMappings[header] || null,
          confidence: savedMappings[header] ? 1 : 0,
          userConfirmed: !!savedMappings[header],
          keepAsMetadata: !savedMappings[header],
          format: source.fieldMappings?.formats?.[header],
        }));

        setState((s) => ({
          ...s,
          mappings,
        }));
      } else {
        // Auto-match columns - returns FieldMapping with format already set
        const mappings = await autoMatchColumns(
          analysis.headers,
          analysis.sampleRows
        );

        setState((s) => ({
          ...s,
          mappings,
        }));
      }

      return true; // Signal success - page can navigate to mapping step
    },
    [source]
  );

  const updateMapping = useCallback(
    (index: number, targetField: string | null) => {
      setState((s) => ({
        ...s,
        mappings: s.mappings.map((m, i) =>
          i === index
            ? { ...m, targetField, userConfirmed: true, keepAsMetadata: !targetField }
            : m
        ),
      }));
    },
    []
  );

  const deleteMapping = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      mappings: s.mappings.map((m, i) =>
        i === index
          ? { ...m, targetField: null, keepAsMetadata: false, format: undefined }
          : m
      ),
    }));
  }, []);

  const updateMappingFormat = useCallback((index: number, format: string) => {
    setState((s) => ({
      ...s,
      mappings: s.mappings.map((m, i) =>
        i === index ? { ...m, format, userConfirmed: true } : m
      ),
    }));
  }, []);

  // Returns true if validation passes, false otherwise
  // Page handles URL navigation
  const validateForPreview = useCallback((): boolean => {
    const validation = validateMappings(state.mappings);
    if (!validation.isValid) {
      setState((s) => ({
        ...s,
        error: `Missing required fields: ${validation.missingFields.join(", ")}`,
      }));
      return false;
    }
    setState((s) => ({ ...s, error: null }));
    return true;
  }, [state.mappings]);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const executeImport = useCallback(async () => {
    if (!source || !state.analysis || !state.file) return;

    setState((s) => ({ ...s, transientStep: "importing", progress: 0, error: null }));

    // Get date and amount mappings with their formats
    const dateMapping = state.mappings.find((m) => m.targetField === "date");
    const amountMapping = state.mappings.find((m) => m.targetField === "amount");

    const dateFormat = dateMapping?.format || "de";
    const amountFormat = amountMapping?.format || "de";

    const amountConfig = getAmountParserConfig(amountFormat);
    if (!amountConfig) {
      setState((s) => ({
        ...s,
        error: "Invalid amount format",
        transientStep: null, // Will fall back to URL step
      }));
      return;
    }

    // Generate import job ID for tracking
    const importJobId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Parse the full CSV file for import
    let rows: Record<string, string>[];
    if (state.analysis.sampleRows.length === state.analysis.totalRows) {
      // Small file - sample has all rows
      rows = state.analysis.sampleRows;
    } else {
      // Large file - need to parse the full file
      const text = await state.file.text();
      const { rows: allRows } = parseCSV(text, state.analysis.options);
      rows = allRows;
    }

    // Build mapping lookup
    const fieldMap = new Map<string, string>();
    for (const mapping of state.mappings) {
      if (mapping.targetField) {
        fieldMap.set(mapping.csvColumn, mapping.targetField);
      }
    }

    // Prepare transactions
    const transactions: Omit<Transaction, "id">[] = [];
    const hashes: string[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Extract mapped values
        let dateValue: string | null = null;
        let amountValue: string | null = null;
        let nameValue: string | null = null;
        let partnerValue: string | null = null;
        let referenceValue: string | null = null;
        let partnerIbanValue: string | null = null;

        for (const [csvCol, targetField] of fieldMap) {
          const value = row[csvCol];
          if (!value) continue;

          switch (targetField) {
            case "date":
              dateValue = value;
              break;
            case "amount":
              amountValue = value;
              break;
            case "name":
              nameValue = value;
              break;
            case "partner":
              partnerValue = value;
              break;
            case "reference":
              referenceValue = value;
              break;
            case "partnerIban":
              partnerIbanValue = value;
              break;
          }
        }

        // Validate required fields
        if (!dateValue || !amountValue || !nameValue) {
          errors.push({
            row: i + 1,
            message: "Missing required fields (date, amount, or description)",
          });
          continue;
        }

        // Parse date
        const parsedDate = parseDate(dateValue, dateFormat);
        if (!parsedDate) {
          errors.push({ row: i + 1, message: `Invalid date: ${dateValue}` });
          continue;
        }

        // Parse amount
        const parsedAmount = parseAmount(amountValue, amountConfig);
        if (parsedAmount === null) {
          errors.push({ row: i + 1, message: `Invalid amount: ${amountValue}` });
          continue;
        }

        // Generate dedupe hash
        const hash = await generateDedupeHash(
          parsedDate,
          parsedAmount,
          source.iban,
          referenceValue
        );

        hashes.push(hash);

        // Create transaction object
        const now = Timestamp.now();
        transactions.push({
          sourceId: source.id,
          date: Timestamp.fromDate(parsedDate),
          amount: parsedAmount,
          currency: source.currency,
          _original: {
            date: dateValue,
            amount: amountValue,
            rawRow: row,
          },
          name: nameValue,
          description: null,
          partner: partnerValue,
          reference: referenceValue,
          partnerIban: partnerIbanValue,
          dedupeHash: hash,
          categoryId: null,
          receiptIds: [],
          isComplete: false,
          importJobId,
          userId: MOCK_USER_ID,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Update progress
      setState((s) => ({
        ...s,
        progress: Math.round(((i + 1) / rows.length) * 50),
      }));
    }

    // Check for duplicates
    const existingHashes = await checkDuplicatesBatch(hashes, source.id);

    // Filter out duplicates
    const newTransactions = transactions.filter(
      (t) => !existingHashes.has(t.dedupeHash)
    );
    const skippedCount = transactions.length - newTransactions.length;

    // Batch write transactions
    let importedCount = 0;
    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = newTransactions.slice(i, i + BATCH_SIZE);

      for (const transaction of chunk) {
        const docRef = doc(collection(db, "transactions"));
        batch.set(docRef, transaction);
      }

      await batch.commit();
      importedCount += chunk.length;

      setState((s) => ({
        ...s,
        progress: 50 + Math.round(((i + chunk.length) / newTransactions.length) * 50),
      }));
    }

    // Save import record to Firestore
    const importDocRef = doc(db, "imports", importJobId);
    await setDoc(importDocRef, {
      sourceId: source.id,
      fileName: state.file.name,
      importedCount,
      skippedCount,
      errorCount: errors.length,
      totalRows: rows.length,
      userId: MOCK_USER_ID,
      createdAt: Timestamp.now(),
    });

    // Update results
    setState((s) => ({
      ...s,
      transientStep: "complete",
      progress: 100,
      results: {
        total: rows.length,
        imported: importedCount,
        skipped: skippedCount,
        errors: errors.length,
      },
    }));
  }, [source, state.file, state.analysis, state.mappings]);

  const reset = useCallback(() => {
    setState({
      transientStep: null,
      file: null,
      analysis: null,
      mappings: [],
      progress: 0,
      results: null,
      error: null,
    });
  }, []);

  return {
    state,
    handleFileAnalyzed,
    updateMapping,
    updateMappingFormat,
    deleteMapping,
    validateForPreview,
    clearError,
    executeImport,
    reset,
  };
}
