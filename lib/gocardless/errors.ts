/**
 * GoCardless API error classes
 */

/**
 * Base error class for GoCardless API errors
 */
export class GoCardlessError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: string
  ) {
    super(message);
    this.name = "GoCardlessError";
  }
}

/**
 * Thrown when bank connection has expired and user needs to re-authenticate
 * PSD2 requires re-authentication every 90 days
 */
export class ReauthRequiredError extends GoCardlessError {
  constructor(
    public sourceId: string,
    public expiresAt: Date
  ) {
    super(
      `Bank connection expired. Re-authorization required.`,
      "REAUTH_REQUIRED"
    );
    this.name = "ReauthRequiredError";
  }
}

/**
 * Thrown when API rate limit is exceeded
 * Banks may limit to as few as 4 API calls per day per account
 */
export class RateLimitError extends GoCardlessError {
  constructor(
    public retryAfter: number,
    public accountId?: string
  ) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      "RATE_LIMIT",
      429
    );
    this.name = "RateLimitError";
  }
}

/**
 * Thrown when access token is invalid or expired
 */
export class AuthenticationError extends GoCardlessError {
  constructor(message: string = "Authentication failed") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Thrown when institution is not available or unsupported
 */
export class InstitutionError extends GoCardlessError {
  constructor(
    public institutionId: string,
    message: string = "Institution not available"
  ) {
    super(message, "INSTITUTION_ERROR");
    this.name = "InstitutionError";
  }
}

/**
 * Thrown when user rejects or cancels the bank authorization
 */
export class AuthorizationRejectedError extends GoCardlessError {
  constructor(
    public requisitionId: string,
    message: string = "User rejected bank authorization"
  ) {
    super(message, "AUTHORIZATION_REJECTED");
    this.name = "AuthorizationRejectedError";
  }
}

/**
 * Thrown when requisition has expired
 */
export class RequisitionExpiredError extends GoCardlessError {
  constructor(public requisitionId: string) {
    super("Bank connection request has expired", "REQUISITION_EXPIRED");
    this.name = "RequisitionExpiredError";
  }
}

/**
 * Parse GoCardless API error response into appropriate error class
 */
export function parseGoCardlessError(
  statusCode: number,
  body: { summary?: string; detail?: string; type?: string }
): GoCardlessError {
  const message = body.summary || body.detail || "Unknown error";
  const details = body.detail;

  if (statusCode === 401) {
    return new AuthenticationError(message);
  }

  if (statusCode === 429) {
    return new RateLimitError(60); // Default retry after 60 seconds
  }

  return new GoCardlessError(message, body.type || "API_ERROR", statusCode, details);
}
