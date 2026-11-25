import {
  createB2MediaReadUrl,
  deleteB2MediaObject,
  getB2MediaObject,
  listB2MediaObjects,
  putB2MediaObject,
} from "../src/lib/b2-media-storage";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const stable = new Uint8Array(bytes);
  return toHex(await crypto.subtle.digest("SHA-256", stable.buffer));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runId = (process.env.GITHUB_RUN_ID ?? "local").replace(/[^a-zA-Z0-9_-]/g, "");
const attempt = (process.env.GITHUB_RUN_ATTEMPT ?? "1").replace(/[^a-zA-Z0-9_-]/g, "");
const proofPrefix = `heavix-media/proof/github-actions/${runId}-${attempt}/`;
const objectKey = proofPrefix + crypto.randomUUID() + ".bin";
const payload = new TextEncoder().encode(
  `HEAVIX-B2-ADAPTER-PROOF\nrun=${runId}\nattempt=${attempt}\n`,
);
let deleteConfirmed = false;

try {
  const expectedHash = await sha256(payload);

  await putB2MediaObject(objectKey, payload, "application/octet-stream");
  console.log("PASS: HEAVIX adapter uploaded one isolated proof object.");

  const directRead = await getB2MediaObject(objectKey);
  assert(await sha256(directRead) === expectedHash, "Direct B2 read-back SHA-256 mismatch.");
  console.log("PASS: signed adapter GET returned byte-identical content.");

  const listed = await listB2MediaObjects(proofPrefix, 100);
  assert(listed.includes(objectKey), "Uploaded proof object was not visible in the scoped listing.");
  console.log("PASS: scoped ListObjectsV2 found only within the proof prefix.");

  const signedUrl = await createB2MediaReadUrl(objectKey, 300);
  const signedResponse = await fetch(signedUrl, { redirect: "error" });
  assert(signedResponse.ok, `Presigned B2 GET failed with HTTP ${signedResponse.status}.`);
  const signedRead = new Uint8Array(await signedResponse.arrayBuffer());
  assert(await sha256(signedRead) === expectedHash, "Presigned GET SHA-256 mismatch.");
  console.log("PASS: short-lived signed read URL returned byte-identical content.");

  await deleteB2MediaObject(objectKey);
  deleteConfirmed = true;

  let stillReadable = false;
  try {
    await getB2MediaObject(objectKey);
    stillReadable = true;
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("HTTP 404"),
      "Post-delete read failed for a reason other than object-not-found.",
    );
  }
  assert(!stillReadable, "Proof object remains readable after delete.");

  const remaining = await listB2MediaObjects(proofPrefix, 100);
  assert(!remaining.includes(objectKey), "Proof object remains visible after delete.");
  console.log("PASS: the exact proof object is no longer addressable after delete.");
  console.log("B2 adapter proof completed. No database, bucket configuration, existing media, backup prefix, or Production resource was touched.");
} finally {
  if (!deleteConfirmed) {
    await deleteB2MediaObject(objectKey).catch(() => {});
  }
}
