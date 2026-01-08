"use client";

import { useState, useCallback, useMemo } from "react";
import {
  collection,
  writeBatch,
  doc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db, functions } from "@/lib/firebase/config";
import { httpsCallable } from "firebase/functions";
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
import { createNotification, uploadImportCSV, OperationsContext } from "@/lib/operations";

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
  isMatching: boolean; // True while AI is analyzing columns
  progress: number;
  results: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
    errorDetails: { row: number; message: string; rowData: Record<string, string> }[];
  } | null;
  error: string | null;
  /** Full CSV content stored for re-mapping later */
  csvContent: string | null;
}

export function useImport(source: TransactionSource | null) {
  const [state, setState] = useState<ImportState>({
    transientStep: null,
    file: null,
    analysis: null,
    mappings: [],
    isMatching: false,
    progress: 0,
    results: null,
    error: null,
    csvContent: null,
  });

  // Operations context for notifications
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Returns true when file is ready to proceed to mapping step
  const handleFileAnalyzed = useCallback(
    async (analysis: CSVAnalysis, file: File): Promise<boolean> => {
      // Read the full CSV content for later storage (re-mapping feature)
      const csvContent = await file.text();

      setState((s) => ({
        ...s,
        file,
        analysis,
        csvContent,
        error: null,
        isMatching: true,
      }));

      try {
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
            isMatching: false,
          }));
        } else {
          // Auto-match columns using AI - returns FieldMapping with format already set
          const mappings = await autoMatchColumns(
            analysis.headers,
            analysis.sampleRows
          );

          setState((s) => ({
            ...s,
            mappings,
            isMatching: false,
          }));
        }

        return true; // Signal success - page can navigate to mapping step
      } catch (error) {
        console.error("Column matching failed:", error);
        setState((s) => ({
          ...s,
          isMatching: false,
          error: `Column matching failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        }));
        return false;
      }
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
    const errors: { row: number; message: string; rowData: Record<string, string> }[] = [];

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
        // Description (name) OR partner is required - having one of them is sufficient
        const missingFields: string[] = [];
        if (!dateValue) missingFields.push("date");
        if (!amountValue) missingFields.push("amount");
        if (!nameValue && !partnerValue) missingFields.push("description or partner");

        if (missingFields.length > 0) {
          errors.push({
            row: i + 1,
            message: `Missing: ${missingFields.join(", ")}`,
            rowData: row,
          });
          continue;
        }

        // Parse date (dateValue is validated above)
        const parsedDate = parseDate(dateValue!, dateFormat);
        if (!parsedDate) {
          errors.push({ row: i + 1, message: `Invalid date: ${dateValue}`, rowData: row });
          continue;
        }

        // Parse amount (amountValue is validated above)
        const parsedAmount = parseAmount(amountValue!, amountConfig);
        if (parsedAmount === null) {
          errors.push({ row: i + 1, message: `Invalid amount: ${amountValue}`, rowData: row });
          continue;
        }

        // Generate dedupe hash (use sourceId as fallback for sources without IBAN like credit cards)
        const hash = await generateDedupeHash(
          parsedDate,
          parsedAmount,
          source.iban ?? source.id,
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
            date: dateValue!,
            amount: amountValue!,
            rawRow: row,
          },
          name: nameValue || partnerValue || "",
          description: null,
          partner: partnerValue,
          reference: referenceValue,
          partnerIban: partnerIbanValue,
          dedupeHash: hash,
          fileIds: [],
          isComplete: false,
          // Partner fields - explicitly null for Firestore query compatibility
          partnerId: null,
          partnerType: null,
          partnerMatchedBy: null,
          partnerMatchConfidence: null,
          partnerSuggestions: [],
          importJobId,
          csvRowIndex: i, // Row index for re-mapping feature
          userId: MOCK_USER_ID,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : "Unknown error",
          rowData: row,
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

    // Batch write transactions, capturing IDs for partner matching
    let importedCount = 0;
    const transactionIds: string[] = [];

    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = newTransactions.slice(i, i + BATCH_SIZE);

      for (const transaction of chunk) {
        const docRef = doc(collection(db, "transactions"));
        transactionIds.push(docRef.id);
        batch.set(docRef, transaction);
      }

      await batch.commit();
      importedCount += chunk.length;

      setState((s) => ({
        ...s,
        progress: 50 + Math.round(((i + chunk.length) / newTransactions.length) * 50),
      }));
    }

    // Run partner matching in batch (non-blocking)
    if (transactionIds.length > 0) {
      const matchPartners = httpsCallable(functions, "matchPartners");
      matchPartners({ transactionIds }).catch((error) => {
        console.error("Failed to match partners after import:", error);
      });
    }

    // Upload CSV to storage for re-mapping feature
    let csvStoragePath: string | undefined;
    let csvDownloadUrl: string | undefined;
    if (state.csvContent) {
      try {
        const csvUploadResult = await uploadImportCSV(
          MOCK_USER_ID,
          importJobId,
          state.csvContent
        );
        csvStoragePath = csvUploadResult.storagePath;
        csvDownloadUrl = csvUploadResult.downloadUrl;
      } catch (err) {
        console.error("Failed to upload CSV for re-mapping:", err);
        // Non-fatal - continue with import record creation
      }
    }

    // Save import record to Firestore
    const importDocRef = doc(db, "imports", importJobId);

    // Build import record data
    // Use explicit null for queryable fields (Firestore queries need null, not missing fields)
    // Sanitize mappings to convert undefined to null (Firestore rejects undefined)
    const sanitizedMappings = state.mappings?.map((m) => ({
      csvColumn: m.csvColumn,
      targetField: m.targetField,
      confidence: m.confidence,
      userConfirmed: m.userConfirmed,
      keepAsMetadata: m.keepAsMetadata,
      format: m.format ?? null, // Convert undefined to null
    })) ?? [];

    const importRecordData = {
      sourceId: source.id,
      fileName: state.file.name,
      importedCount,
      skippedCount,
      errorCount: errors.length,
      totalRows: rows.length,
      userId: MOCK_USER_ID,
      createdAt: Timestamp.now(),
      // CSV storage fields - use null for queryability (e.g., find imports without CSV)
      csvStoragePath: csvStoragePath ?? null,
      csvDownloadUrl: csvDownloadUrl ?? null,
      // Parse options and mappings for re-mapping feature
      parseOptions: state.analysis?.options ?? null,
      fieldMappings: sanitizedMappings,
    };

    await setDoc(importDocRef, importRecordData);

    // Create notification for the import
    if (importedCount > 0) {
      createNotification(ctx, {
        type: "import_complete",
        title: `Imported ${importedCount} transactions`,
        message: `I see you added ${importedCount} new transactions from ${source.name}. Let me match them with your partners.`,
        context: {
          sourceId: source.id,
          sourceName: source.name,
          transactionCount: importedCount,
        },
      }).catch((err) => {
        console.error("Failed to create import notification:", err);
      });
    }

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
        errorDetails: errors,
      },
    }));
  }, [source, state.file, state.analysis, state.mappings, state.csvContent, ctx]);

  const reset = useCallback(() => {
    setState({
      transientStep: null,
      file: null,
      analysis: null,
      mappings: [],
      isMatching: false,
      progress: 0,
      results: null,
      error: null,
      csvContent: null,
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
