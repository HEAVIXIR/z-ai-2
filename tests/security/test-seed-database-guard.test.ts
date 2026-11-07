import { afterEach, describe, expect, it, vi } from "vitest";
import { assertTestSeedTarget } from "../../prisma/test-seed-guard";

afterEach(() => vi.unstubAllEnvs());

describe("test fixture seed database guard", () => {
  it("requires explicit opt-in", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/heavix_test");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "");

    expect(() => assertTestSeedTarget("seed-phase-catalog.ts")).toThrow(
      /HEAVIX_ALLOW_TEST_FIXTURE_SEED=1/,
    );
  });

  it("always blocks production, even if the opt-in flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/heavix_test");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-test-fixtures.ts")).toThrow(
      /NODE_ENV=production/,
    );
  });

  it("blocks remote database hosts", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db.example.com:5432/heavix_test");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-phase-catalog.ts")).toThrow(
      /non-loopback database host/,
    );
  });

  it("blocks non-loopback service aliases even when the database name ends in _test", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/heavix_test");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-test-fixtures.ts")).toThrow(
      /non-loopback database host/,
    );
  });

  it("blocks local databases whose names do not end in _test", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/heavix");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-test-fixtures.ts")).toThrow(
      /must end in "_test"/,
    );
  });

  it("allows explicit fixture seeding only against a local _test database", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/heavix_test?schema=public");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-phase-catalog.ts")).not.toThrow();
  });

  it("accepts the IPv6 loopback literal", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@[::1]:5432/heavix_test");
    vi.stubEnv("HEAVIX_ALLOW_TEST_FIXTURE_SEED", "1");

    expect(() => assertTestSeedTarget("seed-phase-catalog.ts")).not.toThrow();
  });
});
