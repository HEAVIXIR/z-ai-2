import { HeavixAuthCrypto } from "../../workers/auth-crypto/index";

type Env = {
  AUTH_CRYPTO: DurableObjectNamespace<HeavixAuthCrypto>;
  HEAVIX_AUTH_CRYPTO_TEST_MODE?: string;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function getStub(env: Env) {
  const id = env.AUTH_CRYPTO.idFromName("heavix-auth-crypto-workerd-proof");
  return env.AUTH_CRYPTO.get(id);
}

function failure(error: unknown): Response {
  if (error instanceof Error && error.message === "AUTH_CRYPTO_BUSY") {
    return json({ code: "AUTH_CRYPTO_BUSY" }, 429);
  }
  if (error instanceof TypeError) {
    return json({ code: "INVALID_CRYPTO_INPUT" }, 400);
  }
  return json({ code: "AUTH_CRYPTO_TEST_FAILURE" }, 500);
}

/**
 * Local-only RPC harness. Its endpoints stay disabled unless Wrangler dev is
 * explicitly started with HEAVIX_AUTH_CRYPTO_TEST_MODE=1. Never deploy this
 * harness; the production crypto Worker keeps its 404-only HTTP handler.
 */
export { HeavixAuthCrypto };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.HEAVIX_AUTH_CRYPTO_TEST_MODE !== "1") {
      return new Response("Not Found", { status: 404 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, runtime: "workerd" });
    }

    if (request.method !== "POST") {
      return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (url.pathname === "/rpc/hash") {
      try {
        const body: unknown = await request.json();
        if (!body || typeof body !== "object" || !("password" in body) ||
            typeof body.password !== "string") {
          return json({ code: "INVALID_CRYPTO_INPUT" }, 400);
        }
        const hash = await getStub(env).hashPassword(body.password);
        return json({ hash });
      } catch (error) {
        return failure(error);
      }
    }

    if (url.pathname === "/rpc/verify") {
      try {
        const body: unknown = await request.json();
        if (!body || typeof body !== "object" ||
            !("password" in body) || typeof body.password !== "string" ||
            !("hash" in body) || typeof body.hash !== "string") {
          return json({ code: "INVALID_CRYPTO_INPUT" }, 400);
        }
        const valid = await getStub(env).verifyPassword(body.password, body.hash);
        return json({ valid });
      } catch (error) {
        return failure(error);
      }
    }

    if (url.pathname === "/rpc/concurrency") {
      try {
        const stub = getStub(env);
        const outcomes = await Promise.allSettled([
          stub.hashPassword("heavix-workerd-concurrency-a"),
          stub.hashPassword("heavix-workerd-concurrency-b"),
        ]);
        const fulfilled = outcomes.filter((item) => item.status === "fulfilled").length;
        const busyRejected = outcomes.filter((item) =>
          item.status === "rejected" &&
          item.reason instanceof Error &&
          item.reason.message === "AUTH_CRYPTO_BUSY",
        ).length;
        const recoveryHash = await stub.hashPassword("heavix-workerd-recovery");
        const recovered = await stub.verifyPassword("heavix-workerd-recovery", recoveryHash);
        return json({ fulfilled, busyRejected, recovered });
      } catch (error) {
        return failure(error);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
