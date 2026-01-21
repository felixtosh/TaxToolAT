/**
 * GoCardless Banking Provider
 *
 * Adapter for GoCardless Bank Account Data API (formerly Nordigen)
 * https://developer.gocardless.com/bank-account-data/overview
 */

import {
  BankingProviderId,
  BankingProviderInfo,
  BankingInstitution,
  BankingAccount,
  BankingTransaction,
  BankingConfig,
  GoCardlessBankingConfig,
  BankingError,
  RateLimitError,
} from "../types";
import {
  BankingProvider,
  BaseBankingProvider,
  CreateConnectionOptions,
  CreateConnectionResult,
  CallbackOptions,
  CallbackResult,
  FetchTransactionsOptions,
} from "../provider";
import { GoCardlessClient } from "@/lib/gocardless/client";
import {
  GoCardlessInstitution,
  GoCardlessTransaction,
  RequisitionStatus,
} from "@/types/gocardless";
import { RateLimitError as GCRateLimitError } from "@/lib/gocardless/errors";

// Supported countries for GoCardless
const GOCARDLESS_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU",
  "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GB", "CH",
];

/**
 * GoCardless Provider Implementation
 */
export class GoCardlessProvider extends BaseBankingProvider implements BankingProvider {
  readonly id: BankingProviderId = "gocardless";

  private client: GoCardlessClient | null = null;
  private redirectUrl: string = "";

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    const secretId = process.env.GOCARDLESS_SECRET_ID;
    const secretKey = process.env.GOCARDLESS_SECRET_KEY;
    this.redirectUrl = process.env.GOCARDLESS_REDIRECT_URL || "";

    if (secretId && secretKey) {
      this.client = new GoCardlessClient(secretId, secretKey);
    }
  }

  getInfo(): BankingProviderInfo {
    return {
      id: "gocardless",
      name: "GoCardless",
      description: "Open Banking via GoCardless (formerly Nordigen). Supports 2,500+ banks across Europe.",
      supportedCountries: GOCARDLESS_COUNTRIES,
      logoUrl: "https://asset.brandfetch.io/idK50BiIwP/idZ-7_fxWY.svg",
      isEnabled: this.isConfigured(),
      requiresReauth: true,
      reauthDays: 90, // PSD2 requirement
    };
  }

  isConfigured(): boolean {
    return this.client !== null && this.redirectUrl !== "";
  }

  private getClient(): GoCardlessClient {
    if (!this.client) {
      throw new BankingError(
        "GoCardless is not configured. Set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY environment variables.",
        "gocardless",
        "NOT_CONFIGURED"
      );
    }
    return this.client;
  }

  async listInstitutions(countryCode: string): Promise<BankingInstitution[]> {
    const client = this.getClient();

    try {
      const institutions = await client.listInstitutions(countryCode.toUpperCase());
      return institutions.map((inst) => this.transformInstitution(inst));
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async getInstitution(institutionId: string): Promise<BankingInstitution> {
    const client = this.getClient();

    try {
      const institution = await client.getInstitution(institutionId);
      return this.transformInstitution(institution);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async createConnection(options: CreateConnectionOptions): Promise<CreateConnectionResult> {
    const client = this.getClient();

    try {
      // Get institution info
      const institution = await client.getInstitution(options.institutionId);
      const maxHistoricalDays = options.maxHistoryDays ||
        parseInt(institution.transaction_total_days, 10) || 90;

      // Create end user agreement (90 days access, PSD2 max)
      const agreement = await client.createAgreement(
        options.institutionId,
        maxHistoricalDays,
        90
      );

      // Create requisition with redirect
      const redirectUrl = options.redirectUrl || this.redirectUrl;
      const requisition = await client.createRequisition(
        options.institutionId,
        redirectUrl,
        agreement.id,
        options.reference,
        options.language?.toUpperCase() || "EN"
      );

      // Calculate expiration (90 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      return {
        connectionId: requisition.id,
        authUrl: requisition.link,
        expiresAt,
        providerData: {
          agreementId: agreement.id,
          institutionName: institution.name,
          institutionLogo: institution.logo,
        },
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async handleCallback(options: CallbackOptions): Promise<CallbackResult> {
    const client = this.getClient();

    // If there's an error from the callback
    if (options.error) {
      return {
        success: false,
        status: "rejected",
        error: options.errorDescription || options.error,
      };
    }

    try {
      // Get updated requisition status
      const requisition = await client.getRequisition(options.connectionId);
      const status = this.mapRequisitionStatus(requisition.status);

      return {
        success: status === "linked",
        status,
        accountIds: requisition.accounts || [],
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async getConnectionStatus(connectionId: string): Promise<{
    status: "pending" | "authorizing" | "linked" | "expired" | "rejected" | "suspended";
    accountIds?: string[];
  }> {
    const client = this.getClient();

    try {
      const requisition = await client.getRequisition(connectionId);
      return {
        status: this.mapRequisitionStatus(requisition.status),
        accountIds: requisition.accounts || [],
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async getAccounts(connectionId: string): Promise<BankingAccount[]> {
    const client = this.getClient();

    try {
      const requisition = await client.getRequisition(connectionId);
      const accounts: BankingAccount[] = [];

      for (const accountId of requisition.accounts || []) {
        try {
          const account = await client.getAccount(accountId);
          const details = await client.getAccountDetails(accountId);

          accounts.push({
            id: accountId,
            iban: details.account.iban || account.iban,
            ownerName: details.account.ownerName,
            currency: details.account.currency || "EUR",
            type: this.mapAccountType(details.account.cashAccountType),
            status: this.mapAccountStatus(account.status),
            providerId: "gocardless",
          });
        } catch {
          // Skip accounts that can't be accessed
        }
      }

      return accounts;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async fetchTransactions(options: FetchTransactionsOptions): Promise<BankingTransaction[]> {
    const client = this.getClient();

    try {
      const response = await client.getTransactions(
        options.accountId,
        options.dateFrom,
        options.dateTo
      );

      // Only return booked transactions
      const booked = response.transactions?.booked || [];
      return booked.map((tx) => this.transformTransaction(tx));
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async revokeConnection(connectionId: string): Promise<void> {
    const client = this.getClient();

    try {
      await client.deleteRequisition(connectionId);
    } catch {
      // Ignore errors - requisition may already be expired
    }
  }

  // =========================================
  // Private Helpers
  // =========================================

  private transformInstitution(inst: GoCardlessInstitution): BankingInstitution {
    return {
      id: inst.id,
      name: inst.name,
      bic: inst.bic,
      logoUrl: inst.logo,
      countries: inst.countries,
      maxHistoryDays: parseInt(inst.transaction_total_days, 10) || 90,
      providerId: "gocardless",
    };
  }

  private transformTransaction(tx: GoCardlessTransaction): BankingTransaction {
    // Parse amount
    const amount = parseFloat(tx.transactionAmount.amount);

    // Get counterparty name (creditor for outgoing, debtor for incoming)
    const counterpartyName = amount < 0 ? tx.creditorName : tx.debtorName;
    const counterpartyIban = amount < 0
      ? tx.creditorAccount?.iban
      : tx.debtorAccount?.iban;

    // Build description from remittance info
    let description = tx.remittanceInformationUnstructured || "";
    if (!description && tx.remittanceInformationUnstructuredArray?.length) {
      description = tx.remittanceInformationUnstructuredArray.join(" ");
    }
    if (!description && tx.remittanceInformationStructured) {
      description = tx.remittanceInformationStructured;
    }
    if (!description && tx.additionalInformation) {
      description = tx.additionalInformation;
    }

    return {
      id: tx.transactionId || tx.internalTransactionId || `gc_${Date.now()}_${Math.random()}`,
      internalId: tx.internalTransactionId,
      bookingDate: tx.bookingDate || tx.valueDate || new Date().toISOString().split("T")[0],
      valueDate: tx.valueDate,
      amount,
      currency: tx.transactionAmount.currency,
      counterpartyName,
      counterpartyIban,
      description,
      reference: tx.entryReference,
      bankTransactionCode: tx.bankTransactionCode || tx.proprietaryBankTransactionCode,
      rawData: tx as unknown as Record<string, unknown>,
    };
  }

  private mapRequisitionStatus(
    status: RequisitionStatus
  ): "pending" | "authorizing" | "linked" | "expired" | "rejected" | "suspended" {
    switch (status) {
      case "CR":
        return "pending";
      case "GC":
      case "UA":
      case "SA":
      case "GA":
        return "authorizing";
      case "LN":
        return "linked";
      case "EX":
        return "expired";
      case "RJ":
        return "rejected";
      case "SU":
        return "suspended";
      default:
        return "pending";
    }
  }

  private mapAccountType(
    cashAccountType?: string
  ): "checking" | "savings" | "credit_card" | "other" {
    if (!cashAccountType) return "checking";

    const lower = cashAccountType.toLowerCase();
    if (lower.includes("savings")) return "savings";
    if (lower.includes("credit") || lower.includes("card")) return "credit_card";
    if (lower.includes("current") || lower.includes("checking")) return "checking";
    return "other";
  }

  private mapAccountStatus(
    status: string
  ): "active" | "inactive" | "error" {
    switch (status) {
      case "READY":
        return "active";
      case "DISCOVERED":
      case "PROCESSING":
        return "active";
      case "ERROR":
      case "EXPIRED":
      case "SUSPENDED":
        return "error";
      default:
        return "inactive";
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof GCRateLimitError) {
      throw new RateLimitError("gocardless", error.retryAfter);
    }
    throw error;
  }
}

/**
 * Singleton instance
 */
let goCardlessProvider: GoCardlessProvider | null = null;

export function getGoCardlessProvider(): GoCardlessProvider {
  if (!goCardlessProvider) {
    goCardlessProvider = new GoCardlessProvider();
  }
  return goCardlessProvider;
}
