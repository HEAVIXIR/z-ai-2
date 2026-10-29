export type OwnerPromotionTargetEnvironment = "production" | "non-production";

type Environment = Record<string, string | undefined>;

/**
 * Require the operator to explicitly attest which environment DATABASE_URL targets.
 * Production requires both a separate allow flag and a repository/owner-specific
 * confirmation. NODE_ENV=production can never be downgraded to non-production.
 */
export function assertOwnerPromotionTargetEnvironment(
  env: Environment,
): OwnerPromotionTargetEnvironment {
  const target = env.HEAVIX_OWNER_TARGET_ENV_CONFIRM;
  if (target !== "production" && target !== "non-production") {
    throw new Error(
      "Missing or invalid HEAVIX_OWNER_TARGET_ENV_CONFIRM; set it to production or non-production after verifying the database target.",
    );
  }

  if (env.NODE_ENV === "production" && target !== "production") {
    throw new Error("NODE_ENV=production cannot be confirmed as a non-production target.");
  }

  const productionConfirmation = env.HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION;
  const productionFlagsPresent =
    env.HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION !== undefined ||
    productionConfirmation !== undefined;

  if (target === "production") {
    if (env.HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION !== "YES") {
      throw new Error("Production target requires HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION=YES.");
    }
    if (productionConfirmation !== "HEAVIXIR/z-ai-2:main:heavixir@gmail.com") {
      throw new Error(
        "Production confirmation string does not match the repository and owner.",
      );
    }
  } else if (productionFlagsPresent) {
    throw new Error(
      "Production confirmation flags were supplied for a non-production target; confirm the target environment and retry.",
    );
  }

  return target;
}
