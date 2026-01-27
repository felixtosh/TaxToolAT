# Matching Logic Consistency Tasks

## Overview

FiBuKI has 4 matching logics that should follow a consistent pattern:

| Type | Direction | Purpose |
|------|-----------|---------|
| TX→Partner | Transaction to Partner | Match bank transactions to business partners |
| TX→File | Transaction to File | Find receipts/invoices for transactions |
| File→Partner | File to Partner | Identify vendor/customer from invoice |
| File→TX | File to Transaction | Connect invoice to bank transaction |

Each should have:
- **Detail view**: Section with Search (🔍) button for agentic matching
- **List view**: Column with AutomationHeader showing pipeline info
- **Loading state**: Consistent naming, shown in both detail and list views
- **Auto trigger**: Documented chain sequence

---

## Current State Matrix

| Aspect | TX→Partner | TX→File | File→Partner | File→TX |
|--------|:----------:|:-------:|:------------:|:-------:|
| Detail 🔍 button | ✓ | ✓ | ❌ | ⚠️ |
| List AutomationHeader | ✓ | ✓ | ❌ | ❌ |
| Loading in detail | ✓ | ✓ | ⚠️ | ✓ |
| Loading in list | ❌ | ✓ | ❌ | ❌ |
| PipelineId defined | ✓ | ✓ | ❌ | ❌ |
| **Auto→Agentic fallback** | ❌ | ✓ | ⚠️ | ✓ |

### Auto→Agentic Fallback Detail

The pattern should be: **rule-based matching runs → if no confident match → queue agentic worker**

| Type | Rule-based Function | Agentic Fallback | Current State |
|------|---------------------|------------------|---------------|
| TX→File | `matchFileTransactions` trigger | `queueAgenticTransactionSearch()` at line 599-607 | ✓ **COMPLETE** - queues workerRequest when `autoMatches.length === 0` |
| File→TX | Same as above | Same as above | ✓ **COMPLETE** |
| File→Partner | `matchFilePartner` trigger | Gemini `searchByName()` at line ~1050 | ⚠️ **PARTIAL** - uses server-side Gemini, not chat agentic |
| TX→Partner | `matchPartners` callable | **NONE** | ❌ **MISSING** - only stores suggestions, no auto fallback |

### What's Missing for Full Auto→Agentic Chain

**TX→Partner needs auto-agentic fallback:**
- Currently: `matchPartners` runs, stores `partnerSuggestions`, user must click 🔍 manually
- Should be: If no auto-match (≥89%), queue `partner_matching` workerRequest

**File→Partner could upgrade to chat agentic:**
- Currently: Uses Gemini lookup directly in cloud function
- Could be: Queue `partner_matching` workerRequest for more sophisticated reasoning

---

## Task 1: Add Search Button to File→Partner (Detail View)

**Problem**: `file-detail-panel.tsx` imports `startFilePartnerSearchThread` but never renders a Search button in the Partner section.

**Location**: `components/files/file-detail-panel.tsx:137` (import exists)

**Current code** (around line 220-240 in Partner section):
```tsx
// Partner section header has no search button
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-medium">Partner</h3>
  {/* NO SEARCH BUTTON HERE */}
</div>
```

**Fix**: Add Search button matching `transaction-details.tsx:224-239` pattern:

```tsx
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-medium">Partner</h3>
  {!assignedPartner && (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={() => startFilePartnerSearchThread(file.id)}
      disabled={isChatLoading}
      title="Search for partner"
    >
      {isChatLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Search className="h-3.5 w-3.5" />
      )}
    </Button>
  )}
</div>
```

**Files to modify**:
1. `components/files/file-detail-panel.tsx` - Add Search button to Partner section header

---

## Task 2: Add Search Button to File→TX (Detail View)

**Problem**: File detail panel has transaction suggestions but no explicit Search button to trigger `startFileTransactionSearchThread`.

**Location**: `components/files/file-detail-panel.tsx` - Transactions/Connections section

**Current state**: Uses `onOpenConnectTransaction` overlay, but no direct agentic search trigger.

**Fix**: Add Search button in Transactions section header:

```tsx
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-medium">Transactions</h3>
  <div className="flex items-center gap-1">
    {/* Add search button for agentic matching */}
    {(!file.transactionIds || file.transactionIds.length === 0) && (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => startFileTransactionSearchThread(file.id, {
          fileName: file.fileName,
          amount: file.extractedAmount,
          currency: file.extractedCurrency,
          date: file.extractedDate?.toDate().toISOString(),
          partner: assignedPartner?.name,
        })}
        disabled={isChatLoading}
        title="Search for matching transaction"
      >
        {isChatLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Search className="h-3.5 w-3.5" />
        )}
      </Button>
    )}
  </div>
</div>
```

**Files to modify**:
1. `components/files/file-detail-panel.tsx` - Add Search button to Transactions section

---

## Task 3: Add AutomationHeader to File List Columns

**Problem**: `file-columns.tsx` Partner and Transaction columns don't show automation pipeline info like transaction columns do.

**Location**: `components/files/file-columns.tsx`

**Current code**:
```tsx
// Partner column (around line 200)
{
  id: "partner",
  header: "Partner",  // Plain string, no AutomationHeader
  // ...
}

// Transaction column (around line 250)
{
  id: "transaction",
  header: "Transaction",  // Plain string, no AutomationHeader
  // ...
}
```

**Fix Step 1**: Define new PipelineIds in `types/automation.ts`:

```tsx
export type PipelineId =
  | "find-partner"      // TX→Partner (existing)
  | "find-file"         // TX→File (existing)
  | "file-find-partner" // File→Partner (NEW)
  | "file-find-tx";     // File→TX (NEW)
```

**Fix Step 2**: Add pipeline definitions in `lib/matching/automation-defs.ts`:

```tsx
export const FILE_FIND_PARTNER_PIPELINE: AutomationPipeline = {
  id: "file-find-partner",
  name: "Find Partner",
  description: "Match invoice to vendor/customer",
  steps: [
    { id: "extract", name: "Extract Data", description: "Parse invoice for company info" },
    { id: "vat-lookup", name: "VAT Lookup", description: "Check EU VAT registry" },
    { id: "fuzzy-match", name: "Fuzzy Match", description: "Match against known partners" },
    { id: "ai-search", name: "AI Search", description: "Search for company information" },
  ],
};

export const FILE_FIND_TX_PIPELINE: AutomationPipeline = {
  id: "file-find-tx",
  name: "Find Transaction",
  description: "Match invoice to bank transaction",
  steps: [
    { id: "amount-match", name: "Amount Match", description: "Find transactions with similar amounts" },
    { id: "date-match", name: "Date Match", description: "Filter by date proximity" },
    { id: "partner-match", name: "Partner Match", description: "Prioritize same-partner transactions" },
    { id: "ai-match", name: "AI Match", description: "Use AI to find best match" },
  ],
};
```

**Fix Step 3**: Update `file-columns.tsx`:

```tsx
import { AutomationHeader } from "@/components/ui/data-table";
import { PipelineId } from "@/types/automation";

export function getFileColumns(
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = [],
  transactionAmountsMap?: Map<string, TransactionAmountInfo[]>,
  onAutomationClick?: (pipelineId: PipelineId) => void  // ADD THIS PARAM
): ColumnDef<TaxFile>[] {
  // ...

  // Partner column
  {
    id: "partner",
    header: () =>
      onAutomationClick ? (
        <AutomationHeader
          label="Partner"
          pipelineId="file-find-partner"
          onAutomationClick={onAutomationClick}
        />
      ) : (
        "Partner"
      ),
    // ...
  },

  // Transaction column
  {
    id: "transaction",
    header: () =>
      onAutomationClick ? (
        <AutomationHeader
          label="Transaction"
          pipelineId="file-find-tx"
          onAutomationClick={onAutomationClick}
        />
      ) : (
        "Transaction"
      ),
    // ...
  },
}
```

**Fix Step 4**: Update files page to pass callback:

```tsx
// app/(dashboard)/files/page.tsx
const columns = getFileColumns(
  userPartners,
  globalPartners,
  transactionAmountsMap,
  handleAutomationClick  // Pass the callback
);
```

**Files to modify**:
1. `types/automation.ts` - Add new PipelineIds
2. `lib/matching/automation-defs.ts` - Add pipeline definitions
3. `components/files/file-columns.tsx` - Add AutomationHeader to columns
4. `app/(dashboard)/files/page.tsx` - Pass onAutomationClick callback

---

## Task 4: Add Loading State to List Views

**Problem**: Transaction list shows searching state via `searchingTransactionIds`, but file list doesn't show any loading indicators.

**Location**:
- `components/transactions/transaction-columns.tsx:41` - has `searchingTransactionIds?: Set<string>`
- `components/files/file-columns.tsx` - NO equivalent

**Fix Step 1**: Add searching state to file columns:

```tsx
// file-columns.tsx - add to function params
export function getFileColumns(
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = [],
  transactionAmountsMap?: Map<string, TransactionAmountInfo[]>,
  onAutomationClick?: (pipelineId: PipelineId) => void,
  searchingFileIds?: Set<string>  // ADD THIS
): ColumnDef<TaxFile>[] {
```

**Fix Step 2**: Show loading in Partner column:

```tsx
// In Partner column cell
cell: ({ row }) => {
  const isSearching = searchingFileIds?.has(row.original.id);

  if (isSearching) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs">Matching...</span>
      </div>
    );
  }
  // ... rest of cell
}
```

**Fix Step 3**: Create context for file searching state (similar to `use-precision-search-context.tsx`):

```tsx
// hooks/use-file-search-context.tsx
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface FileSearchContextValue {
  searchingFileIds: Set<string>;
  setSearching: (fileId: string, searching: boolean) => void;
  isSearchingFile: (fileId: string) => boolean;
}

const FileSearchContext = createContext<FileSearchContextValue | null>(null);

export function FileSearchProvider({ children }: { children: ReactNode }) {
  const [searchingFileIds, setSearchingFileIds] = useState<Set<string>>(new Set());

  const setSearching = useCallback((fileId: string, searching: boolean) => {
    setSearchingFileIds((prev) => {
      const next = new Set(prev);
      if (searching) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  }, []);

  const isSearchingFile = useCallback(
    (fileId: string) => searchingFileIds.has(fileId),
    [searchingFileIds]
  );

  return (
    <FileSearchContext.Provider value={{ searchingFileIds, setSearching, isSearchingFile }}>
      {children}
    </FileSearchContext.Provider>
  );
}

export function useFileSearchContext() {
  const context = useContext(FileSearchContext);
  if (!context) {
    throw new Error("useFileSearchContext must be used within FileSearchProvider");
  }
  return context;
}
```

**Files to modify**:
1. `hooks/use-file-search-context.tsx` - Create new context (NEW FILE)
2. `components/files/file-columns.tsx` - Add searchingFileIds param and loading UI
3. `app/(dashboard)/files/page.tsx` - Wrap with FileSearchProvider, pass searchingFileIds

---

## Task 5: Standardize Loading State Variable Names

**Problem**: Inconsistent naming across components:
- TX→Partner: `isLoadingSuggestions`
- TX→File: `isSearching`, `isPrecisionSearching`
- File→Partner: `isAssigningPartner` (conflates search vs assign)
- File→TX: `isRematchingTransactions`

**Proposed standard naming**:
- `isSearching{Type}` for agentic/manual search
- `isMatching{Type}` for auto-matching in progress
- `isAssigning{Type}` for user-initiated assignment

**Fix**: Rename variables for consistency (non-breaking internal changes):

| Current | New | File |
|---------|-----|------|
| `isLoadingSuggestions` | `isMatchingPartner` | transaction-details.tsx |
| `isPrecisionSearching` | `isSearchingFile` | transaction-files-section.tsx |
| `isRematchingTransactions` | `isMatchingTransaction` | file-detail-panel.tsx |

**Note**: This is a lower priority refactor - the existing names work, just inconsistent.

---

## Task 6: Add Auto→Agentic Fallback for TX→Partner

**Problem**: When `matchPartners` runs and doesn't find a confident match (≥89%), it just stores suggestions. User must manually click 🔍 to trigger agentic search. This is inconsistent with TX→File which auto-queues agentic worker.

**Location**: `functions/src/matching/matchPartners.ts`

**Current behavior** (end of function, ~line 200+):
```typescript
// Returns after storing suggestions - no agentic fallback
return { processed, autoMatched, withSuggestions };
```

**Fix**: Add agentic worker queue like `matchFileTransactions.ts:599-607`:

```typescript
// At end of matchPartners, after processing all transactions:

// Queue agentic worker for transactions that didn't auto-match
const noAutoMatchIds = results
  .filter(r => !r.autoMatched && r.suggestions.length > 0)
  .map(r => r.transactionId);

if (noAutoMatchIds.length > 0 && noAutoMatchIds.length <= 5) {
  // Only queue for small batches to avoid flooding
  for (const transactionId of noAutoMatchIds) {
    await queueAgenticPartnerSearch(userId, transactionId);
  }
}

// Helper function (add near top of file):
async function queueAgenticPartnerSearch(
  userId: string,
  transactionId: string
): Promise<void> {
  const requestRef = db.collection(`users/${userId}/workerRequests`).doc();
  await requestRef.set({
    id: requestRef.id,
    workerType: "partner_matching",
    initialPrompt: `Find partner for transaction ID: ${transactionId}`,
    triggerContext: {
      transactionId,
      triggeredAfterRuleBasedMatch: true,
    },
    triggeredBy: "auto",
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`[PartnerMatch] Queued agentic search for transaction ${transactionId}`);
}
```

**Alternative approach**: Queue from `transaction-details.tsx` when suggestions arrive but no auto-match. This keeps cloud function simple but requires frontend to handle it.

**Files to modify**:
1. `functions/src/matching/matchPartners.ts` - Add worker queue at end
2. OR `components/sidebar/transaction-details.tsx` - Auto-trigger on mount when no partner but has suggestions

---

## Task 7: Add Info/History Buttons to File Detail Panel

**Problem**: Transaction detail has Info (ℹ️) and History (🕐) buttons for automation, file detail doesn't.

**Location**:
- `transaction-files-section.tsx:586-613` - has Info, History, Search buttons
- `file-detail-panel.tsx` - only has basic actions

**Fix**: Add AutomationHistoryDialog and AutomationDialog to file detail panel for both Partner and Transaction sections.

```tsx
// file-detail-panel.tsx - add state
const [isPartnerHistoryOpen, setIsPartnerHistoryOpen] = useState(false);
const [isPartnerInfoOpen, setIsPartnerInfoOpen] = useState(false);
const [isTxHistoryOpen, setIsTxHistoryOpen] = useState(false);
const [isTxInfoOpen, setIsTxInfoOpen] = useState(false);

// In Partner section header:
<div className="flex items-center gap-1">
  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsPartnerInfoOpen(true)}>
    <Info className="h-3.5 w-3.5" />
  </Button>
  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsPartnerHistoryOpen(true)}>
    <History className="h-3.5 w-3.5" />
  </Button>
  {/* Search button from Task 1 */}
</div>

// Add dialogs at bottom of component
<AutomationDialog
  open={isPartnerInfoOpen}
  onClose={() => setIsPartnerInfoOpen(false)}
  pipelineId="file-find-partner"
  integrationStatuses={integrationStatuses}
/>
<AutomationHistoryDialog
  open={isPartnerHistoryOpen}
  onClose={() => setIsPartnerHistoryOpen(false)}
  file={file}
  pipelineId="file-find-partner"
/>
```

**Files to modify**:
1. `components/files/file-detail-panel.tsx` - Add Info/History buttons and dialogs
2. `components/automations/automation-history-dialog.tsx` - Ensure it accepts `file` prop (may need update)
3. `components/automations/automation-dialog.tsx` - Ensure file pipelines are supported

---

## Task 8: (Optional) Upgrade File→Partner to Chat Agentic

**Current state**: `matchFilePartner` uses Gemini `searchByName()` directly in the cloud function. This works but isn't visible in the chat sidebar.

**Optional upgrade**: Queue `partner_matching` workerRequest when Gemini lookup fails, allowing chat-based reasoning.

**This is lower priority** because:
- Gemini lookup already provides AI capability
- File→Partner usually succeeds (has extractedPartner, VAT ID, etc.)
- Chat agentic is more valuable for TX→Partner where data is sparse

**If implementing**: Follow same pattern as Task 6, add `queueAgenticPartnerSearch()` at end of `matchFilePartner` when no match found.

---

## Summary: Implementation Order

### Phase 1: UI Consistency (Tasks 1-5)
1. **Task 3** (PipelineIds) - Foundation for other tasks
2. **Task 1** (File→Partner Search button) - Quick win, high visibility
3. **Task 2** (File→TX Search button) - Quick win, high visibility
4. **Task 4** (List loading states) - Improves UX consistency
5. **Task 7** (Info/History buttons) - Adds missing functionality

### Phase 2: Auto→Agentic Chain (Task 6)
6. **Task 6** (TX→Partner auto-agentic) - Completes the fallback chain

### Phase 3: Cleanup (Task 5)
7. **Task 5** (Variable naming) - Low priority cleanup

## Verification Checklist

### UI Consistency
- [x] File detail Partner section has 🔍 button that opens chat sidebar
- [x] File detail Transactions section has 🔍 button that opens chat sidebar
- [x] File list Partner column header shows (i) icon, opens AutomationDialog
- [x] File list Transaction column header shows (i) icon, opens AutomationDialog
- [x] Searching state shows spinner in file list columns
- [x] All 4 matching types have consistent UI pattern

### Auto→Agentic Fallback
- [x] TX→Partner: Auto-queues workerRequest when no confident match
- [x] TX→File: ✓ Already queues via `queueAgenticTransactionSearch`
- [ ] File→Partner: ⚠️ Uses Gemini (acceptable, or upgrade to worker queue)
- [x] File→TX: ✓ Same as TX→File
