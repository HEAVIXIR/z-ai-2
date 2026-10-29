import { describe, expect, it } from "vitest";
import { assertOwnerPromotionTargetEnvironment } from "../scripts/owner-promotion-environment";

describe("owner promotion target-environment guard", () => {
  it("fails closed when the target environment is missing", () => {
    expect(() => assertOwnerPromotionTargetEnvironment({})).toThrow(
      /HEAVIX_OWNER_TARGET_ENV_CONFIRM/,
    );
  });

  it("accepts an explicitly confirmed non-production target", () => {
    expect(
      assertOwnerPromotionTargetEnvironment({
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "non-production",
      }),
    ).toBe("non-production");
  });

  it("does not allow NODE_ENV=production to be declared non-production", () => {
    expect(() =>
      assertOwnerPromotionTargetEnvironment({
        NODE_ENV: "production",
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "non-production",
      }),
    ).toThrow(/cannot be confirmed as a non-production target/);
  });

  it("requires both production confirmations for a production target", () => {
    expect(() =>
      assertOwnerPromotionTargetEnvironment({
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "production",
      }),
    ).toThrow(/ALLOW_PRODUCTION=YES/);
  });

  it("accepts production only with exact, separate confirmations", () => {
    expect(
      assertOwnerPromotionTargetEnvironment({
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "production",
        HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION: "YES",
        HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION:
          "HEAVIXIR/z-ai-2:main:heavixir@gmail.com",
      }),
    ).toBe("production");
  });

  it("rejects production confirmation flags paired with non-production", () => {
    expect(() =>
      assertOwnerPromotionTargetEnvironment({
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "non-production",
        HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION: "YES",
      }),
    ).toThrow(/flags were supplied for a non-production target/);
  });

  it("rejects invalid environment declarations", () => {
    expect(() =>
      assertOwnerPromotionTargetEnvironment({
        HEAVIX_OWNER_TARGET_ENV_CONFIRM: "prod",
      }),
    ).toThrow(/HEAVIX_OWNER_TARGET_ENV_CONFIRM/);
  });
});
