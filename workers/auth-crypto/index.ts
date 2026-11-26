import { DurableObject } from "cloudflare:workers";
import {
  hashPasswordWithBcrypt,
  verifyPasswordWithBcrypt,
} from "./crypto";

interface Env {}

const MAX_ACTIVE_OPERATIONS = 1;

/**
 * Private, stateless bcrypt compute object.
 *
 * It deliberately has no storage calls, alarms, fetch handler, credential logs,
 * or database bindings. Call it only through a same-account Worker RPC binding.
 */
export class HeavixAuthCrypto extends DurableObject<Env> {
  private activeOperations = 0;

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeOperations >= MAX_ACTIVE_OPERATIONS) {
      throw new Error("AUTH_CRYPTO_BUSY");
    }

    this.activeOperations += 1;
    try {
      return await operation();
    } finally {
      this.activeOperations -= 1;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return this.runExclusive(() => hashPasswordWithBcrypt(password));
  }

  async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    return this.runExclusive(() => verifyPasswordWithBcrypt(password, encodedHash));
  }
}

/** There is intentionally no public HTTP API on this Worker. */
export default {
  fetch(): Response {
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
