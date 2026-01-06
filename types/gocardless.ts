import { Timestamp } from "firebase/firestore";

/**
 * GoCardless Bank Account Data API types
 * https://developer.gocardless.com/bank-account-data/overview
 */

/**
 * Bank institution from GoCardless API
 */
export interface GoCardlessInstitution {
  id: string;
  name: string;
  bic: string;
  logo: string;
  countries: string[];
  /** Maximum days of transaction history available */
  transaction_total_days: string;
}

/**
 * Requisition status codes from GoCardless
 * https://developer.gocardless.com/bank-account-data/statuses
 */
export type RequisitionStatus =
  | "CR" // Created - Requisition has been created
  | "GC" // Giving Consent - User is giving consent
  | "UA" // Undergoing Authentication - User is authenticating
  | "RJ" // Rejected - User rejected or error occurred
  | "SA" // Selecting Accounts - User is selecting accounts
  | "GA" // Granting Access - Access is being granted
  | "LN" // Linked - Successfully linked
  | "SU" // Suspended - Access has been suspended
  | "EX"; // Expired - Requisition has expired

/**
 * Account status from GoCardless
 */
export type AccountStatus =
  | "DISCOVERED"
  | "PROCESSING"
  | "ERROR"
  | "EXPIRED"
  | "READY"
  | "SUSPENDED";

/**
 * GoCardless requisition stored in Firestore
 */
export interface GoCardlessRequisition {
  id: string;
  /** GoCardless requisition ID */
  requisitionId: string;
  /** Institution this requisition is for */
  institutionId: string;
  institutionName: string;
  institutionLogo?: string;
  /** Current status */
  status: RequisitionStatus;
  /** Authorization link for user */
  link: string;
  /** Account IDs retrieved after authorization */
  accountIds: string[];
  /** End user agreement ID */
  agreementId: string;
  /** When the agreement expires (90 days from creation) */
  agreementExpiresAt: Timestamp;
  /** Our internal reference */
  reference: string;
  /** Owner */
  userId: string;
  /** Optional: existing source ID to link (for re-auth/connect existing) */
  linkToSourceId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * GoCardless account details
 */
export interface GoCardlessAccount {
  id: string;
  iban: string;
  status: AccountStatus;
  ownerName?: string;
  institutionId: string;
  created: string;
  last_accessed?: string;
}

/**
 * GoCardless account details response
 */
export interface GoCardlessAccountDetails {
  resourceId?: string;
  iban?: string;
  currency?: string;
  ownerName?: string;
  name?: string;
  product?: string;
  cashAccountType?: string;
}

/**
 * GoCardless transaction from API
 */
export interface GoCardlessTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: {
    iban?: string;
    bban?: string;
  };
  debtorName?: string;
  debtorAccount?: {
    iban?: string;
    bban?: string;
  };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  remittanceInformationStructured?: string;
  bankTransactionCode?: string;
  proprietaryBankTransactionCode?: string;
  additionalInformation?: string;
}

/**
 * GoCardless transactions response
 */
export interface GoCardlessTransactionsResponse {
  transactions: {
    booked: GoCardlessTransaction[];
    pending?: GoCardlessTransaction[];
  };
}

/**
 * GoCardless-specific API config stored on TransactionSource
 */
export interface GoCardlessApiConfig {
  provider: "gocardless";
  /** GoCardless requisition ID */
  requisitionId: string;
  /** GoCardless account ID */
  accountId: string;
  /** Institution identifier */
  institutionId: string;
  institutionName: string;
  institutionLogo?: string;
  /** When the agreement expires (90 days PSD2 limit) */
  agreementExpiresAt: Timestamp;
  /** Last successful sync */
  lastSyncAt?: Timestamp;
  /** Last sync error if any */
  lastSyncError?: string;
  /** Sync schedule (cron expression) */
  syncSchedule?: string;
}

/**
 * Sync job record
 */
export interface SyncJob {
  id: string;
  sourceId: string;
  userId: string;
  status: "pending" | "running" | "completed" | "failed";
  transactionsImported: number;
  transactionsSkipped: number;
  error?: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

/**
 * GoCardless API error response
 */
export interface GoCardlessErrorResponse {
  summary: string;
  detail: string;
  type?: string;
  status_code: number;
}

/**
 * Token response from GoCardless
 */
export interface GoCardlessTokenResponse {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

/**
 * Agreement response from GoCardless
 */
export interface GoCardlessAgreementResponse {
  id: string;
  created: string;
  institution_id: string;
  max_historical_days: number;
  access_valid_for_days: number;
  access_scope: string[];
  accepted?: string;
}

/**
 * Requisition response from GoCardless
 */
export interface GoCardlessRequisitionResponse {
  id: string;
  created: string;
  redirect: string;
  status: RequisitionStatus;
  institution_id: string;
  agreement: string;
  reference: string;
  accounts: string[];
  user_language: string;
  link: string;
  ssn?: string;
  account_selection: boolean;
  redirect_immediate: boolean;
}
