/**
 * TrueLayer Data API Client
 *
 * https://docs.truelayer.com/docs/data-api-basics
 */

import { BankingError, RateLimitError } from "../../types";

// Base URLs
const AUTH_URL = "https://auth.truelayer.com";
const API_URL_SANDBOX = "https://api.truelayer-sandbox.com";
const API_URL_PRODUCTION = "https://api.truelayer.com";

/**
 * TrueLayer provider information
 */
export interface TrueLayerProvider {
  provider_id: string;
  display_name: string;
  logo_uri: string;
  country: string;
  scopes: string[];
}

/**
 * TrueLayer account
 */
export interface TrueLayerAccount {
  account_id: string;
  account_type: "TRANSACTION" | "SAVINGS" | "BUSINESS_TRANSACTION" | "BUSINESS_SAVINGS";
  display_name?: string;
  currency: string;
  account_number?: {
    number?: string;
    sort_code?: string;
    iban?: string;
    swift_bic?: string;
  };
  provider?: {
    provider_id: string;
    display_name: string;
    logo_uri: string;
  };
  update_timestamp?: string;
}

/**
 * TrueLayer transaction
 */
export interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  amount: number;
  currency: string;
  transaction_type: "DEBIT" | "CREDIT";
  transaction_category: string;
  transaction_classification: string[];
  merchant_name?: string;
  running_balance?: {
    amount: number;
    currency: string;
  };
  meta?: Record<string, unknown>;
}

/**
 * TrueLayer token response
 */
export interface TrueLayerTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * TrueLayer API Client
 */
export class TrueLayerClient {
  private apiUrl: string;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private sandbox: boolean = false
  ) {
    this.apiUrl = sandbox ? API_URL_SANDBOX : API_URL_PRODUCTION;
  }

  /**
   * Generate authorization URL for user to connect their bank
   */
  generateAuthUrl(options: {
    redirectUri: string;
    scope: string[];
    providerId?: string;
    state?: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scope.join(" "),
      response_mode: "form_post",
    });

    if (options.providerId) {
      params.set("provider_id", options.providerId);
    }

    if (options.state) {
      params.set("state", options.state);
    }

    // Enable account selection
    params.set("enable_account_selection", "true");

    return `${AUTH_URL}/?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<TrueLayerTokenResponse> {
    const response = await fetch(`${AUTH_URL}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BankingError(
        error.error_description || "Failed to exchange code",
        "truelayer",
        error.error
      );
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TrueLayerTokenResponse> {
    const response = await fetch(`${AUTH_URL}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BankingError(
        error.error_description || "Failed to refresh token",
        "truelayer",
        error.error
      );
    }

    return response.json();
  }

  /**
   * List available providers (banks) for a country
   */
  async listProviders(options?: {
    clientId?: string;
  }): Promise<TrueLayerProvider[]> {
    // TrueLayer's /providers endpoint is public but requires client_id
    const params = new URLSearchParams({
      client_id: options?.clientId || this.clientId,
    });

    const response = await fetch(
      `${AUTH_URL}/api/providers?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      this.handleErrorResponse(response);
    }

    return response.json();
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    accessToken: string,
    method: string,
    path: string
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      this.handleErrorResponse(response);
    }

    const data = await response.json();
    return data.results || data;
  }

  /**
   * Get all accounts for the authenticated user
   */
  async getAccounts(accessToken: string): Promise<TrueLayerAccount[]> {
    return this.request<TrueLayerAccount[]>(accessToken, "GET", "/data/v1/accounts");
  }

  /**
   * Get a specific account
   */
  async getAccount(accessToken: string, accountId: string): Promise<TrueLayerAccount> {
    const accounts = await this.request<TrueLayerAccount[]>(
      accessToken,
      "GET",
      `/data/v1/accounts/${accountId}`
    );
    return accounts[0];
  }

  /**
   * Get transactions for an account
   */
  async getTransactions(
    accessToken: string,
    accountId: string,
    options?: {
      from?: string;
      to?: string;
    }
  ): Promise<TrueLayerTransaction[]> {
    let path = `/data/v1/accounts/${accountId}/transactions`;
    const params = new URLSearchParams();

    if (options?.from) params.set("from", options.from);
    if (options?.to) params.set("to", options.to);

    if (params.toString()) {
      path += `?${params.toString()}`;
    }

    return this.request<TrueLayerTransaction[]>(accessToken, "GET", path);
  }

  /**
   * Get pending transactions for an account
   */
  async getPendingTransactions(
    accessToken: string,
    accountId: string
  ): Promise<TrueLayerTransaction[]> {
    return this.request<TrueLayerTransaction[]>(
      accessToken,
      "GET",
      `/data/v1/accounts/${accountId}/transactions/pending`
    );
  }

  /**
   * Get account balance
   */
  async getBalance(
    accessToken: string,
    accountId: string
  ): Promise<{ current: number; available: number; currency: string }> {
    const balances = await this.request<
      Array<{
        current: number;
        available: number;
        currency: string;
        update_timestamp: string;
      }>
    >(accessToken, "GET", `/data/v1/accounts/${accountId}/balance`);

    return balances[0];
  }

  /**
   * Get account holder info
   */
  async getAccountHolderInfo(
    accessToken: string
  ): Promise<{
    full_name: string;
    date_of_birth?: string;
    addresses?: Array<{
      address: string;
      city: string;
      zip: string;
      country: string;
    }>;
  }> {
    const info = await this.request<
      Array<{
        full_name: string;
        date_of_birth?: string;
        addresses?: Array<{
          address: string;
          city: string;
          zip: string;
          country: string;
        }>;
      }>
    >(accessToken, "GET", "/data/v1/info");

    return info[0];
  }

  /**
   * Delete user credentials (revoke access)
   */
  async deleteCredentials(accessToken: string): Promise<void> {
    const response = await fetch(`${AUTH_URL}/api/delete`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok && response.status !== 204) {
      this.handleErrorResponse(response);
    }
  }

  private handleErrorResponse(response: Response): never {
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
      throw new RateLimitError("truelayer", retryAfter);
    }

    throw new BankingError(
      `TrueLayer API error: ${response.status} ${response.statusText}`,
      "truelayer",
      response.status.toString()
    );
  }
}
