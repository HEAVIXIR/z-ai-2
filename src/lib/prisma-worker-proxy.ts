/**
 * Request-scoped Prisma helpers for Cloudflare Workers.
 *
 * The resolver is module-scoped, but each lookup is keyed by the current
 * request ExecutionContext. A client and its adapter are never shared across
 * concurrent requests.
 */
export function createRequestScopedClientResolver<TClient, TEnv>(
  createClient: (requestKey: object, env: TEnv) => TClient,
): (requestKey: object, env: TEnv) => TClient {
  const clients = new WeakMap<object, TClient>();
  return (requestKey, env) => {
    const existing = clients.get(requestKey);
    if (existing !== undefined) return existing;
    const client = createClient(requestKey, env);
    clients.set(requestKey, client);
    return client;
  };
}

/** Preserve db.model.method call sites without caching clients in delegates. */
export function createRequestScopedPrismaProxy<TClient extends object>(
  getClient: () => TClient,
): TClient {
  const delegates = new Map<PropertyKey, object>();
  return new Proxy({} as TClient, {
    get(_target, property) {
      if (property === Symbol.toStringTag) return "PrismaClient";
      if (property === "then") return undefined;
      if (typeof property === "string" && property.startsWith("$")) {
        return (...args: unknown[]) => {
          const client = getClient();
          const method = Reflect.get(client, property, client);
          if (typeof method !== "function") return method;
          return Reflect.apply(method, client, args);
        };
      }
      let delegate = delegates.get(property);
      if (!delegate) {
        delegate = new Proxy({}, {
          get(_delegateTarget, method) {
            if (method === "then") return undefined;
            if (method === "fields") {
              const client = getClient();
              const modelDelegate = Reflect.get(client, property, client) as object;
              return Reflect.get(modelDelegate, method, modelDelegate);
            }
            return (...args: unknown[]) => {
              const client = getClient();
              const modelDelegate = Reflect.get(client, property, client) as object;
              const member = Reflect.get(modelDelegate, method, modelDelegate);
              if (typeof member !== "function") return member;
              return Reflect.apply(member, modelDelegate, args);
            };
          },
        });
        delegates.set(property, delegate);
      }
      return delegate;
    },
  });
}
