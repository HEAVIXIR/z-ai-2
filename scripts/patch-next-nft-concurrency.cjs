"use strict";

const fs = require("node:fs");
const path = require("node:path");

const expectedNextVersions = new Set(["16.4.3", "16.4.5"]);
const targetConcurrency = 16;
const nftPath = require.resolve("next/dist/compiled/@vercel/nft");
const nextPackagePath = path.resolve(path.dirname(nftPath), "../../../../package.json");
const nextVersion = JSON.parse(fs.readFileSync(nextPackagePath, "utf8")).version;

if (!expectedNextVersions.has(nextVersion)) {
  throw new Error(
    `HEAVIX_NFT_PATCH_BLOCKED: expected Next.js ${[...expectedNextVersions].join(" or ")}, found ${nextVersion}`
  );
}

const source = fs.readFileSync(nftPath, "utf8");
const needle = "fileIOConcurrency:w=1024";
const replacement = "fileIOConcurrency:w=16";
const occurrences = source.split(needle).length - 1;

if (occurrences === 1) {
  fs.writeFileSync(nftPath, source.replace(needle, replacement));
  process.stdout.write(
    `HEAVIX_NFT_PATCH_APPLIED next=${nextVersion} fileIOConcurrency=1024->${targetConcurrency}\n`
  );
} else if (occurrences === 0 && source.includes(replacement)) {
  process.stdout.write(
    `HEAVIX_NFT_PATCH_ALREADY_APPLIED next=${nextVersion} fileIOConcurrency=${targetConcurrency}\n`
  );
} else {
  throw new Error(
    `HEAVIX_NFT_PATCH_BLOCKED: expected one ${needle} in ${nftPath}, found ${occurrences}`
  );
}
