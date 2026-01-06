/**
 * GoCardless Bank Account Data API Client
 * https://developer.gocardless.com/bank-account-data/overview
 */

import {
  GoCardlessInstitution,
  GoCardlessTokenResponse,
  GoCardlessAgreementResponse,
  GoCardlessRequisitionResponse,
  GoCardlessAccount,
  GoCardlessAccountDetails,
  GoCardlessTransactionsResponse,
  RequisitionStatus,
} from "@/types/gocardless";
import {
  GoCardlessError,
  RateLimitError,
  AuthenticationError,
  parseGoCardlessError,
} from "./errors";

const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

/**
 * GoCardless API Client
 *
 * Handles authentication, token refresh, and all API operations
 */
export class GoCardlessClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(
    private secretId: string,
    private secretKey: string
  ) {}

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    // If we have a valid token, return it
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    // If we have a refresh token, try to refresh
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.accessToken!;
      } catch {
        // Refresh failed, get new token
      }
    }

    // Get new token
    await this.createToken();
    return this.accessToken!;
  }

  /**
   * Create new access token from secret credentials
   */
  private async createToken(): Promise<void> {
    const response = await fetch(`${BASE_URL}/token/new/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_id: this.secretId,
        secret_key: this.secretKey,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new AuthenticationError(body.detail || "Failed to create token");
    }

    const data: GoCardlessTokenResponse = await response.json();
    this.accessToken = data.access;
    this.refreshToken = data.refresh;
    // Token expires in seconds, subtract 60 seconds buffer
    this.tokenExpiresAt = new Date(Date.now() + (data.access_expires - 60) * 1000);
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(`${BASE_URL}/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: this.refreshToken }),
    });

    if (!response.ok) {
      this.refreshToken = null;
      throw new AuthenticationError("Failed to refresh token");
    }

    const data = await response.json();
    this.accessToken = data.access;
    this.tokenExpiresAt = new Date(Date.now() + (data.access_expires - 60) * 1000);
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
      throw new RateLimitError(retryAfter);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw parseGoCardlessError(response.status, errorBody);
    }

    return response.json();
  }

  // =========================================
  // INSTITUTIONS
  // =========================================

  /**
   * List available financial institutions for a country
   * @param country - ISO 3166 two-letter country code (e.g., "AT", "DE", "GB")
   */
  async listInstitutions(country: string): Promise<GoCardlessInstitution[]> {
    return this.request<GoCardlessInstitution[]>(
      "GET",
      `/institutions/?country=${country.toUpperCase()}`
    );
  }

  /**
   * Get a specific institution by ID
   */
  async getInstitution(institutionId: string): Promise<GoCardlessInstitution> {
    return this.request<GoCardlessInstitution>(
      "GET",
      `/institutions/${institutionId}/`
    );
  }

  // =========================================
  // AGREEMENTS
  // =========================================

  /**
   * Create end user agreement
   * Defines the data scope and access duration
   *
   * @param institutionId - The institution to create agreement for
   * @param maxHistoricalDays - Max days of transaction history (default: institution max)
   * @param accessValidForDays - How long access is valid (default: 90, max: 90)
   */
  async createAgreement(
    institutionId: string,
    maxHistoricalDays?: number,
    accessValidForDays: number = 90
  ): Promise<GoCardlessAgreementResponse> {
    const body: Record<string, unknown> = {
      institution_id: institutionId,
      access_valid_for_days: Math.min(accessValidForDays, 90), // PSD2 max is 90
      access_scope: ["balances", "details", "transactions"],
    };

    if (maxHistoricalDays) {
      body.max_historical_days = maxHistoricalDays;
    }

    return this.request<GoCardlessAgreementResponse>(
      "POST",
      "/agreements/enduser/",
      body
    );
  }

  /**
   * Get agreement details
   */
  async getAgreement(agreementId: string): Promise<GoCardlessAgreementResponse> {
    return this.request<GoCardlessAgreementResponse>(
      "GET",
      `/agreements/enduser/${agreementId}/`
    );
  }

  /**
   * Delete an agreement
   */
  async deleteAgreement(agreementId: string): Promise<void> {
    await this.request<void>("DELETE", `/agreements/enduser/${agreementId}/`);
  }

  // =========================================
  // REQUISITIONS
  // =========================================

  /**
   * Create a requisition (bank connection request)
   * Returns a link for the user to authorize access at their bank
   *
   * @param institutionId - The institution to connect to
   * @param redirectUrl - URL to redirect after authorization
   * @param agreementId - The agreement ID created earlier
   * @param reference - Optional reference for tracking (e.g., internal requisition ID)
   * @param userLanguage - User's preferred language (ISO 639-1, e.g., "DE", "EN")
   */
  async createRequisition(
    institutionId: string,
    redirectUrl: string,
    agreementId: string,
    reference?: string,
    userLanguage: string = "EN"
  ): Promise<GoCardlessRequisitionResponse> {
    return this.request<GoCardlessRequisitionResponse>(
      "POST",
      "/requisitions/",
      {
        institution_id: institutionId,
        redirect: redirectUrl,
        agreement: agreementId,
        reference: reference || `req_${Date.now()}`,
        user_language: userLanguage.toUpperCase(),
      }
    );
  }

  /**
   * Get requisition details including linked accounts
   */
  async getRequisition(requisitionId: string): Promise<GoCardlessRequisitionResponse> {
    return this.request<GoCardlessRequisitionResponse>(
      "GET",
      `/requisitions/${requisitionId}/`
    );
  }

  /**
   * List all requisitions
   */
  async listRequisitions(): Promise<{
    count: number;
    results: GoCardlessRequisitionResponse[];
  }> {
    return this.request<{
      count: number;
      results: GoCardlessRequisitionResponse[];
    }>("GET", "/requisitions/");
  }

  /**
   * Delete a requisition (revokes access)
   */
  async deleteRequisition(requisitionId: string): Promise<void> {
    await this.request<void>("DELETE", `/requisitions/${requisitionId}/`);
  }

  // =========================================
  // ACCOUNTS
  // =========================================

  /**
   * Get account metadata
   */
  async getAccount(accountId: string): Promise<GoCardlessAccount> {
    return this.request<GoCardlessAccount>("GET", `/accounts/${accountId}/`);
  }

  /**
   * Get account details (IBAN, owner name, etc.)
   */
  async getAccountDetails(accountId: string): Promise<{ account: GoCardlessAccountDetails }> {
    return this.request<{ account: GoCardlessAccountDetails }>(
      "GET",
      `/accounts/${accountId}/details/`
    );
  }

  /**
   * Get account balances
   */
  async getAccountBalances(
    accountId: string
  ): Promise<{
    balances: Array<{
      balanceAmount: { amount: string; currency: string };
      balanceType: string;
      referenceDate?: string;
    }>;
  }> {
    return this.request<{
      balances: Array<{
        balanceAmount: { amount: string; currency: string };
        balanceType: string;
        referenceDate?: string;
      }>;
    }>("GET", `/accounts/${accountId}/balances/`);
  }

  /**
   * Get account transactions
   *
   * @param accountId - The account ID
   * @param dateFrom - Start date (ISO format, e.g., "2024-01-01")
   * @param dateTo - End date (ISO format)
   */
  async getTransactions(
    accountId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<GoCardlessTransactionsResponse> {
    let path = `/accounts/${accountId}/transactions/`;
    const params = new URLSearchParams();

    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    if (params.toString()) {
      path += `?${params.toString()}`;
    }

    return this.request<GoCardlessTransactionsResponse>("GET", path);
  }

  // =========================================
  // UTILITIES
  // =========================================

  /**
   * Check if a requisition status indicates it's ready for use
   */
  static isRequisitionLinked(status: RequisitionStatus): boolean {
    return status === "LN";
  }

  /**
   * Check if a requisition status indicates an error or rejection
   */
  static isRequisitionFailed(status: RequisitionStatus): boolean {
    return status === "RJ" || status === "EX" || status === "SU";
  }

  /**
   * Check if a requisition status indicates it's still in progress
   */
  static isRequisitionPending(status: RequisitionStatus): boolean {
    return status === "CR" || status === "GC" || status === "UA" || status === "SA" || status === "GA";
  }
}
