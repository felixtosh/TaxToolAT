# Claude Code Instructions

## Project Overview
FiBuKI - A tax/accounting tool for managing bank transactions, receipts, and categorization.

## Architecture: Operations Layer Pattern

**IMPORTANT**: This project uses an operations layer abstraction for all data access. This enables both the React UI and MCP server (AI tools) to share the same business logic.

### The Pattern

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  React UI   │  │ MCP Server  │  │ Future Chat │
│  (hooks)    │  │ (Claude)    │  │    API      │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
             ┌──────────▼──────────┐
             │  Operations Layer   │  ← All Firestore logic here
             │  /lib/operations/   │
             └──────────┬──────────┘
                        │
             ┌──────────▼──────────┐
             │     Firebase        │
             └────────────────────┘
```

### Rules for New Features

1. **NEVER write Firestore queries directly in hooks or components**
   - ❌ `import { getDocs } from "firebase/firestore"` in `/hooks/`
   - ✅ `import { listSources } from "@/lib/operations"` in `/hooks/`

2. **All data mutations go through `/lib/operations/`**
   - Create a new `*-ops.ts` file for new entities
   - Export functions that take `OperationsContext` as first param
   - Re-export from `/lib/operations/index.ts`

3. **Hooks are for React state + realtime listeners only**
   - Use `onSnapshot` for realtime updates (stays in hook)
   - Call operations layer for mutations

4. **When adding a new entity/feature:**
   ```
   1. Add types to /types/new-entity.ts
   2. Create /lib/operations/new-entity-ops.ts
   3. Export from /lib/operations/index.ts
   4. Create /hooks/use-new-entity.ts (calls operations layer)
   5. Add MCP tools to /mcp-server/src/tools/new-entity.ts
   ```

### Example: Adding a new operation

```typescript
// /lib/operations/category-ops.ts
import { OperationsContext } from "./types";

export async function listCategories(ctx: OperationsContext) {
  // Firestore query here
}

export async function createCategory(ctx: OperationsContext, data: CategoryData) {
  // Firestore mutation here
}
```

```typescript
// /hooks/use-categories.ts
import { listCategories, createCategory } from "@/lib/operations";
import { useAuth } from "@/components/auth";

export function useCategories() {
  const { userId } = useAuth();
  const ctx = useMemo(() => ({ db, userId: userId ?? "" }), [userId]);

  // Realtime listener stays in hook
  useEffect(() => { onSnapshot(...) }, [userId]);

  // Mutations call operations layer
  const addCategory = useCallback((data) => createCategory(ctx, data), [ctx]);
}
```

## Business Rules

### Transaction Deletion NOT Allowed

**CRITICAL**: Individual transactions cannot be deleted through the UI or MCP.

**Reason**: Transactions are tied to bank account imports. If a bank CSV doesn't include all transactions, deleting individual ones would create accounting inconsistencies.

**Correct behavior**:
- Transactions can only be deleted when their entire source (bank account) is deleted
- Use `deleteTransactionsBySource()` in operations layer
- The `deleteTransaction` and `bulkDeleteTransactions` functions are NOT exposed

**If someone asks to delete a transaction**: Explain that this would break accounting integrity. They should either:
1. Delete and re-import the entire bank account
2. Mark the transaction with a note/category instead

## Test Data

### Generating Test Data
The app includes a test data toggle on the Bank Accounts page (`/sources`):
- **Enable Test Data**: Creates "Test Bank Account" with 100 sample transactions
- **Disable Test Data**: Removes the test source and all its transactions

### Test Data Files
- `/lib/test-data/generate-test-transactions.ts` - Generates test source + 100 transactions
- `/hooks/use-test-source.ts` - Hook for activating/deactivating test data

### Updating Test Data
When modifying transaction-related types, also update the test data generator:

**Files that require test data updates when changed:**
- `types/transaction.ts` - Transaction interface
- `types/source.ts` - TransactionSource interface
- `lib/import/field-definitions.ts` - Import field definitions

**Test data includes:**
- 85 realistic transactions (expenses: REWE, Amazon, Netflix, etc. / income: salary, freelance)
- 15 edge cases (large amounts, special characters, missing fields, duplicates)

## Key Directories
- `/app/(dashboard)/` - Main app pages (sources, transactions)
- `/components/` - React components
- `/hooks/` - Custom React hooks
- `/lib/` - Utilities and business logic
- `/types/` - TypeScript interfaces

## Data Storage
- Firebase Firestore for data persistence
- Collections: `sources`, `transactions`, `receipts`, `files`, `partners`, `emailIntegrations`
- User authentication via Firebase Auth (email/password + Google Sign-In)
- User ID obtained from `useAuth()` hook in client components or `getServerUserIdWithFallback()` in API routes

## Authentication
- Firebase Auth with email/password and Google Sign-In
- Invite-only registration (admin must add email to `allowedEmails` collection)
- Admin system uses Firebase custom claims (`admin: true`)
- Super admin: `felix@i7v6.com` (hardcoded, auto-granted admin on first login)
- Auth context provided by `AuthProvider` in `/components/auth/`
- Protected routes use `ProtectedRoute` component
