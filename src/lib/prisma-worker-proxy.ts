/**
 * Request-scoped Prisma helpers for Cloudflare Workers.
 *
 * A Prisma client/adapter created for one Workers request must not be reused
 * by another request. The request key is held weakly so completed request
 * contexts do not keep clients alive.
 */
export function createRequestScopedClientResolver<TClient>(
  getRequestKey: () => object,
  createClient: () => TClient,
): () => TClient {
  const clients = new WeakMap<object, TClient>();

  return () => {
    const key = getRequestKey();
    const existing = clients.get(key);
    if (existing !== undefined) return existing;

    const client = createClient();
    clients.set(key, client);
    return client;
  };
}

/**
 * Preserve the existing db.model.method call sites while resolving the
 * underlying Prisma client at method invocation time, inside the request.
 * Delegate proxies cache no Prisma client or I/O handles.
 */
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
        delegate = new Proxy(
          {},
          {
            get(_delegateTarget, method) {
              if (method === "then") return undefined;
              if (method === "fields") {
                const client = getClient();
                const modelDelegate = Reflect.get(client, property, client);
                return Reflect.get(modelDelegate, method, modelDelegate);
              }

              return (...args: unknown[]) => {
                const client = getClient();
                const modelDelegate = Reflect.get(client, property, client);
                const member = Reflect.get(modelDelegate, method, modelDelegate);
                if (typeof member !== "function") return member;
                return Reflect.apply(member, modelDelegate, args);
              };
            },
          },
        );
        delegates.set(property, delegate);
      }

      return delegate;
    },
  });
}
