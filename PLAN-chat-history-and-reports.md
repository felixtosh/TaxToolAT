# Implementation Plan: Chat History & UVA Reports

## Overview

Two major features to implement:
1. **Chat History UI** - Button next to "new chat" showing conversation history
2. **UVA Report Section** - Tax reporting to Austrian Finanzamt

---

## Part 1: Chat History Feature

### Current State
- Chat sessions stored in Firestore: `users/{userId}/chatSessions/{sessionId}/`
- `listChatSessions()` exists in `/lib/operations/chat-ops.ts`
- `loadSession()` in ChatProvider is a placeholder (doesn't load from Firestore)
- LangGraph manages conversation state

### Tasks

#### 1.1 Create Chat History Overlay Component
**File**: `/components/chat/chat-history-overlay.tsx`

- List of past conversations with:
  - Title (auto-generated from first message)
  - Last message preview
  - Timestamp (relative: "2 hours ago", "Yesterday")
  - Message count badge
- Click to load conversation
- Delete conversation option
- Search/filter conversations

#### 1.2 Add History Button to Chat Sidebar
**File**: `/components/chat/chat-sidebar.tsx`

- Add clock/history icon button next to the "+" new chat button
- Opens the chat history overlay
- Show active session indicator

#### 1.3 Implement Session Loading in ChatProvider
**File**: `/components/chat/chat-provider.tsx`

- Fix `loadSession()` to actually load messages from Firestore
- Use `getChatMessages()` from chat-ops.ts
- Convert stored messages back to Vercel AI SDK format
- Clear current messages and load historical ones

#### 1.4 Add Hook for Chat Sessions List
**File**: `/hooks/use-chat-sessions.ts`

- Real-time listener for user's chat sessions
- Sorted by `updatedAt` descending
- Include session metadata (title, preview, count)

#### 1.5 Add Delete Session Operation
**File**: `/lib/operations/chat-ops.ts`

- `deleteChatSession(ctx, sessionId)` - Delete session and all messages
- Add to operations index

---

## Part 2: UVA Report Section

### Current State
- No country field in user profile
- No reporting functionality exists
- Transactions have `isComplete` field for filing status
- VAT IDs stored in user data (`vatIds: string[]`)

### Tasks

#### 2.1 Add Country Field to User Profile
**File**: `/types/user-data.ts`

Add:
```typescript
country: string; // ISO 3166-1 alpha-2 (e.g., "AT", "DE", "CH")
```

**File**: `/components/settings/identity-form.tsx`
- Add country selector dropdown
- Default to "AT" (Austria) initially

#### 2.2 Create Report Types
**File**: `/types/report.ts`

```typescript
interface UVAReport {
  id: string;
  userId: string;
  period: { year: number; month: number } | { year: number; quarter: number };
  country: "AT" | "DE"; // Expandable
  status: "draft" | "validated" | "submitted" | "confirmed";

  // Calculated values
  netRevenue: number;       // Nettoumsatz
  vatCollected: number;     // Vereinnahmte USt
  inputVat: number;         // Vorsteuer
  vatPayable: number;       // Zahllast / Gutschrift

  // Breakdown by VAT rate
  vatBreakdown: {
    rate: number;           // 20%, 13%, 10%, 0%
    netAmount: number;
    vatAmount: number;
  }[];

  // Metadata
  transactionCount: number;
  incompleteTransactions: number;
  createdAt: Timestamp;
  submittedAt?: Timestamp;
}
```

#### 2.3 Create Report Operations
**File**: `/lib/operations/report-ops.ts`

Functions:
- `calculateUVAReport(ctx, period)` - Calculate from transactions
- `getReportReadiness(ctx, period)` - Check if all transactions complete
- `createUVADraft(ctx, period)` - Save draft report
- `submitUVAReport(ctx, reportId)` - Mark as submitted
- `listReports(ctx)` - List all reports

#### 2.4 Create Report Page
**File**: `/app/(dashboard)/reports/page.tsx`

Layout:
- Period selector (month/quarter picker)
- Country indicator (from user profile)
- Readiness check card:
  - ✅ All transactions have receipts
  - ❌ X transactions missing documentation (link to fix)
- Report preview card:
  - Net revenue by VAT rate
  - VAT collected
  - Input VAT (Vorsteuer)
  - **VAT payable (Zahllast)**
- Export options:
  - Download PDF
  - Download XML (FinanzOnline format)
  - Submit directly (future)

#### 2.5 Create Report Sidebar Navigation
**File**: `/components/layout/sidebar.tsx`

Add "Reports" navigation item with FileText icon

#### 2.6 Create Readiness Check Component
**File**: `/components/reports/readiness-check.tsx`

- Query incomplete transactions for period
- Show blocking issues:
  - Transactions without files/categories
  - Missing partner information
  - Unmatched amounts
- Link each issue to fix (opens transaction)

#### 2.7 Create UVA Preview Component
**File**: `/components/reports/uva-preview.tsx`

Austrian UVA-specific display:
- KZ (Kennzahl) codes matching official form
- Breakdown by VAT rate (20%, 13%, 10%, 0%)
- Reverse charge handling
- EU acquisitions/deliveries (innergemeinschaftlich)

#### 2.8 Create PDF Export
**File**: `/lib/reports/generate-uva-pdf.ts`

Generate PDF matching Austrian UVA format using `@react-pdf/renderer`

#### 2.9 Create XML Export (FinanzOnline Format)
**File**: `/lib/reports/generate-uva-xml.ts`

Generate XML in format accepted by FinanzOnline portal

#### 2.10 Add Transaction VAT Fields (if missing)
**File**: `/types/transaction.ts`

Ensure transactions have:
```typescript
vatRate?: number;           // 0, 10, 13, 20
vatAmount?: number;         // In cents
isReverseCharge?: boolean;  // Reverse charge applies
isEuTransaction?: boolean;  // EU cross-border
```

---

## Implementation Order

### Phase 1: Chat History (simpler, standalone) - COMPLETED
1. [x] 1.4 - Hook for chat sessions list (`/hooks/use-chat-sessions.ts`)
2. [x] 1.5 - Delete session operation (already existed in `chat-ops.ts`)
3. [x] 1.1 - Chat history overlay component (`/components/chat/chat-history-overlay.tsx`)
4. [x] 1.2 - History button in sidebar (`/components/chat/chat-tabs.tsx`)
5. [x] 1.3 - Session loading in ChatProvider (`/components/chat/chat-provider.tsx`)

### Phase 2: Report Foundation - COMPLETED
1. [x] 2.1 - Country field in user profile (`/types/user-data.ts`, `/app/(dashboard)/settings/identity/page.tsx`)
2. [x] 2.2 - Report types (`/types/report.ts`)
3. [x] 2.3 - Report operations (`/lib/operations/report-ops.ts`)
4. [x] 2.5 - Sidebar navigation (`/app/(dashboard)/layout.tsx`)

### Phase 3: Report UI - COMPLETED
1. [x] 2.4 - Report page (`/app/(dashboard)/reports/page.tsx`)
2. [x] 2.6 - Readiness check component (`/components/reports/readiness-check.tsx`)
3. [x] 2.7 - UVA preview component (`/components/reports/uva-preview.tsx`)

### Phase 4: Report Export - PARTIAL (UI ready, backend pending)
1. [ ] 2.8 - PDF export (button in UI, needs `@react-pdf/renderer` integration)
2. [ ] 2.9 - XML export for FinanzOnline (button in UI, needs format implementation)
3. [x] 2.10 - VAT fields on transactions (`/types/transaction.ts`)

---

## Notes

### Austrian UVA Specifics
- **Filing Period**: Monthly (revenue > €100k) or quarterly
- **Deadline**: 15th of second month after period
- **Portal**: finanzonline.bmf.gv.at
- **Format**: XML submission or manual entry
- **VAT Rates**: 20% (standard), 13% (tourism), 10% (food/books), 0% (exempt)

### Future Expansion
- Germany (Umsatzsteuer-Voranmeldung via ELSTER)
- Switzerland (MWST via ESTV)
- EU OSS reporting
