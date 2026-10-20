/**
 * STEP 14.67 E2 — pglite with empty-response workaround.
 *
 * Patches PGlite's execProtocol to detect empty responses (which happen
 * for some message types like Close) and inject the correct response.
 *
 * Without this patch, Prisma Client sees an empty buffer after certain
 * messages (Close) and treats it as a protocol error (P1017
 * UnexpectedMessage), then reports "Can't reach database server"
 * (P1001) on subsequent queries.
 *
 * The fix: when PGlite returns an empty data buffer, we synthesize the
 * appropriate PostgreSQL response based on the message type:
 *   - Close (C) → CloseComplete (3) + ReadyForQuery (Z I)
 *   - others → ReadyForQuery (Z I)
 */
import { PGlite } from "@electric-sql/pglite";
import { createServer, LogLevel } from "pglite-server";

async function main() {
  console.log("[pglite-fix] Starting PGlite with empty-response workaround...");
  const db = new PGlite();
  await db.waitReady;
  console.log("[pglite-fix] PGlite is ready");

  // Wrap db.execProtocol to handle empty responses
  const origExec = db.execProtocol.bind(db);
  // @ts-ignore - patching
  db.execProtocol = async (buffer: Buffer) => {
    const result = await origExec(buffer);
    if (!result || !result.data || result.data.length === 0) {
      // PGlite returned empty — synthesize the appropriate response
      // based on the message type (first byte of the request buffer).
      const msgType = buffer.length > 0 ? String.fromCharCode(buffer[0]) : "";
      let synth: Buffer;
      if (msgType === "C") {
        // CloseComplete ('3') + ReadyForQuery ('Z' 'I')
        synth = Buffer.from([
          0x33, 0x00, 0x00, 0x00, 0x04, // '3' CloseComplete
          0x5a, 0x00, 0x00, 0x00, 0x05, 0x49, // 'Z' ReadyForQuery (I = idle)
        ]);
      } else {
        // Default: ReadyForQuery
        synth = Buffer.from([
          0x5a, 0x00, 0x00, 0x00, 0x05, 0x49, // 'Z' ReadyForQuery (I = idle)
        ]);
      }
      return { ...result, data: synth };
    }
    return result;
  };

  const PORT = 5432;
  const pgServer = createServer(db, { logLevel: LogLevel.Info });

  pgServer.listen(PORT, () => {
    console.log(`[pglite-fix] listening on ${PORT}`);
  });

  process.on('SIGINT', () => {
    console.log('[pglite-fix] Shutting down...');
    pgServer.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[pglite-fix] Error:', err);
  process.exit(1);
});
