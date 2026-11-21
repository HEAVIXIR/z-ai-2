/**
 * HEAVIX identity vocabulary.
 * Commercial personas and organization roles are not platform RBAC roles.
 * Keep these keys stable; display labels belong in the UI/i18n layer.
 */
export const COMMERCIAL_PERSONA_KEYS = [
  "INDIVIDUAL",
  "DEALER",
  "MANUFACTURER",
  "IMPORTER_DISTRIBUTOR",
  "RENTAL_COMPANY",
  "AUCTION_HOUSE",
  "BROKER",
  "SERVICE_PROVIDER",
  "FLEET_OPERATOR",
  "PUBLIC_ORGANIZATION",
] as const;

export type CommercialPersonaKey = (typeof COMMERCIAL_PERSONA_KEYS)[number];

export const COMPANY_MEMBERSHIP_ROLE_KEYS = [
  "OWNER",
  "ORG_ADMIN",
  "SALES_MANAGER",
  "SALES_REP",
  "INVENTORY_MANAGER",
  "BUYER",
  "FINANCE",
  "SERVICE_MANAGER",
  "TECHNICIAN",
  "VIEWER",
] as const;

export type CompanyMembershipRoleKey = (typeof COMPANY_MEMBERSHIP_ROLE_KEYS)[number];

export const COMPANY_MEMBERSHIP_STATUSES = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
] as const;

export function isCommercialPersonaKey(value: unknown): value is CommercialPersonaKey {
  return typeof value === "string" &&
    (COMMERCIAL_PERSONA_KEYS as readonly string[]).includes(value);
}

export function isCompanyMembershipRoleKey(value: unknown): value is CompanyMembershipRoleKey {
  return typeof value === "string" &&
    (COMPANY_MEMBERSHIP_ROLE_KEYS as readonly string[]).includes(value);
}
