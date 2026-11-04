"use strict";

const fs = require("node:fs");
const path = require("node:path");

const expectedNextVersion = "16.4.5";
const targetConcurrency = 16;
const nftPath = require.resolve("next/dist/compiled/@vercel/nft");
const nextPackagePath = path.resolve(path.dirname(nftPath), "../../../../package.json");
const nextVersion = JSON.parse(fs.readFileSync(nextPackagePath, "utf8")).version;

if (nextVersion !== expectedNextVersion) {
  throw new Error(
    `HEAVIX_NFT_PATCH_BLOCKED: expected Next.js ${expectedNextVersion}, found ${nextVersion}`
  );
}

const source = fs.readFileSync(nftPath, "utf8");
const concurrencyNeedle = "fileIOConcurrency:w=1024";
const concurrencyReplacement = "fileIOConcurrency:w=16";
const readFileNeedle = "if(t.readFile)s.readFile=t.readFile;";
const readFileReplacement = "if(t.readFile)s.readFile=(p)=>s.cachedFileSystem.executeFileIO(p,()=>t.readFile(p));";

const concurrencyOccurrences = source.split(concurrencyNeedle).length - 1;
const readFileOccurrences = source.split(readFileNeedle).length - 1;
const concurrencyPatched = source.includes(concurrencyReplacement);
const readFilePatched = source.includes(readFileReplacement);

if (concurrencyOccurrences === 1 && readFileOccurrences === 1) {
  const updated = source
    .replace(concurrencyNeedle, concurrencyReplacement)
    .replace(readFileNeedle, readFileReplacement);
  fs.writeFileSync(nftPath, updated);
  process.stdout.write(
    `HEAVIX_NFT_PATCH_APPLIED next=${nextVersion} fileIOConcurrency=1024->${targetConcurrency} customReadFile=semaphore${"\\n"}`
  );
} else if (
  concurrencyOccurrences === 0 &&
  readFileOccurrences === 0 &&
  concurrencyPatched &&
  readFilePatched
) {
  process.stdout.write(
    `HEAVIX_NFT_PATCH_ALREADY_APPLIED next=${nextVersion} fileIOConcurrency=${targetConcurrency} customReadFile=semaphore${"\\n"}`
  );
} else {
  throw new Error(
    `HEAVIX_NFT_PATCH_BLOCKED: expected exactly one unpatched concurrency token and custom readFile hook in ${nftPath}; found concurrency=${concurrencyOccurrences}, readFile=${readFileOccurrences}, patchedConcurrency=${concurrencyPatched}, patchedReadFile=${readFilePatched}`
  );
}
