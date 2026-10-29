import { afterEach, describe, expect, it } from "vitest";
import { checkCsrf } from "../src/lib/csrf";

const originalNextAuthUrl = process.env.NEXTAUTH_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercelUrl = process.env.VERCEL_URL;
const originalVercelBranchUrl = process.env.VERCEL_BRANCH_URL;
const originalVercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

afterEach(() => {
  if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = originalNextAuthUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = originalVercelUrl;
  if (originalVercelBranchUrl === undefined) delete process.env.VERCEL_BRANCH_URL;
  else process.env.VERCEL_BRANCH_URL = originalVercelBranchUrl;
  if (originalVercelProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProductionUrl;
});

describe("checkCsrf", () => {
  it("allows same-origin POSTs on a configured Vercel alias when NEXTAUTH_URL is canonical", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: { origin: "https://heavix-app.vercel.app" },
    });

    expect(checkCsrf(req)).toBe(true);
  });

  it("rejects a cross-origin POST", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("does not trust an attacker-controlled request URL as an allowed origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://attacker.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects mutation requests with no Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("rejects requests when either supplied Origin or Referer is cross-origin", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";
    process.env.VERCEL_URL = "heavix-app.vercel.app";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://heavix-app.vercel.app",
        referer: "https://attacker.example/form",
      },
    });

    expect(checkCsrf(req)).toBe(false);
  });

  it("allows safe methods without Origin or Referer", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_URL = "https://heavix.example.com";

    const req = new Request("https://heavix-app.vercel.app/api/auth/register", {
      method: "GET",
    });

    expect(checkCsrf(req)).toBe(true);
  });
});
