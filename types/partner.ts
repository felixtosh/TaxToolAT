import { Timestamp } from "firebase/firestore";

/**
 * Matching algorithm source identifier
 */
export type MatchSource = "iban" | "vatId" | "website" | "name" | "manual";

/**
 * How a partner was matched to a transaction
 */
export type MatchedBy = "auto" | "manual" | "suggestion";

/**
 * External registry identifiers
 */
export interface ExternalIds {
  /** Austrian Firmenbuch number */
  justizOnline?: string;
  /** EU company registry ID */
  euCompany?: string;
  /** LEI (Legal Entity Identifier) */
  lei?: string;
}

/**
 * Address structure for partners
 */
export interface PartnerAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2 country code */
  country: string;
}

/**
 * Source details for global partners (crowdsourced data)
 */
export interface SourceDetails {
  /** User IDs who contributed to this partner's data */
  contributingUserIds: string[];
  /** Confidence score (0-100) based on contribution count and consistency */
  confidence: number;
  /** When the data was last verified */
  verifiedAt?: Timestamp;
  /** Admin who verified, if any */
  verifiedBy?: string;
}

/**
 * Global partner - shared across all users
 * Collection: /globalPartners/{id}
 */
export interface GlobalPartner {
  id: string;

  /** Primary display name */
  name: string;

  /** Alternative names (trade names, abbreviations) */
  aliases: string[];

  /** Business address */
  address?: PartnerAddress;

  /** Country of incorporation (ISO 3166-1 alpha-2) */
  country?: string;

  /** VAT identification number (with country prefix, e.g., ATU12345678) */
  vatId?: string;

  /** Known IBANs associated with this partner */
  ibans: string[];

  /** Website URL (normalized - no protocol, no www) */
  website?: string;

  /** External registry identifiers */
  externalIds?: ExternalIds;

  /** How this data was sourced */
  source: "manual" | "user_promoted" | "external_registry";

  /** Details about data sourcing */
  sourceDetails: SourceDetails;

  /** Active status (soft delete) */
  isActive: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * User-specific partner
 * Collection: /partners/{id} with userId field
 */
export interface UserPartner {
  id: string;

  /** Owner of this partner record */
  userId: string;

  /** Optional link to global partner (if this is a local copy) */
  globalPartnerId?: string;

  /** Display name */
  name: string;

  /** Alternative names */
  aliases: string[];

  /** Business address */
  address?: PartnerAddress;

  /** Country (ISO 3166-1 alpha-2) */
  country?: string;

  /** VAT identification number */
  vatId?: string;

  /** Known IBANs */
  ibans: string[];

  /** Website URL (normalized) */
  website?: string;

  /** User notes */
  notes?: string;

  /** Default category to assign for transactions with this partner */
  defaultCategoryId?: string;

  /** Active status (soft delete) */
  isActive: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Partner suggestion stored on transaction
 */
export interface PartnerSuggestion {
  /** Partner ID (can be global or user) */
  partnerId: string;
  /** Whether this is a global or user partner */
  partnerType: "global" | "user";
  /** Confidence score (0-100) */
  confidence: number;
  /** Which matching algorithm found this */
  source: MatchSource;
}

/**
 * Form data for creating/editing a partner
 */
export interface PartnerFormData {
  name: string;
  aliases?: string[];
  address?: PartnerAddress;
  country?: string;
  vatId?: string;
  ibans?: string[];
  website?: string;
  notes?: string;
  defaultCategoryId?: string;
}

/**
 * Form data for creating/editing a global partner (admin)
 */
export interface GlobalPartnerFormData extends PartnerFormData {
  externalIds?: ExternalIds;
  source?: "manual" | "user_promoted" | "external_registry";
}

/**
 * Filters for partner queries
 */
export interface PartnerFilters {
  /** Text search in name, aliases, vatId */
  search?: string;
  /** Filter by VAT ID presence */
  hasVatId?: boolean;
  /** Filter by country */
  country?: string;
  /** Filter by IBAN presence */
  hasIban?: boolean;
}

/**
 * Result of partner matching
 */
export interface PartnerMatchResult {
  partnerId: string;
  partnerType: "global" | "user";
  partnerName: string;
  confidence: number;
  source: MatchSource;
}

/**
 * Candidate partner for promotion to global
 */
export interface PromotionCandidate {
  /** The user partner being considered for promotion */
  userPartner: UserPartner;
  /** Number of users with similar partner data */
  userCount: number;
  /** Aggregated confidence score for promotion */
  confidence: number;
  /** Status of promotion review */
  status: "pending" | "approved" | "rejected";
  /** When this candidate was created */
  createdAt: Timestamp;
  /** When reviewed */
  reviewedAt?: Timestamp;
  /** Admin who reviewed */
  reviewedBy?: string;
}
