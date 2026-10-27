#!/usr/bin/env python3
"""Build a secret-safe provenance inventory from legacy ZIP members.

The script reads archive members in memory and never extracts or executes them.
Outputs contain paths, hashes, sizes, and dispositions only; no member contents.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

LEGACY_ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "legacy-source")
MANIFEST = Path("docs/legacy-parity/IMPORT-MANIFEST-2026-10-26.csv")
OUT = Path("provenance-output")
OUT.mkdir(parents=True, exist_ok=True)

if not MANIFEST.is_file():
    raise SystemExit(f"Missing manifest: {MANIFEST}")

with MANIFEST.open(newline="", encoding="utf-8-sig") as stream:
    decisions = {row["path"]: row["decision"] for row in csv.DictReader(stream)}

tracked = subprocess.run(
    ["git", "ls-files", "-z"], check=True, capture_output=True
).stdout.decode("utf-8", errors="surrogateescape").split("\0")
tracked_paths = {p for p in tracked if p}

occurrence_rows: list[dict[str, object]] = []
by_identity: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
archive_summaries: list[dict[str, object]] = []
zip_paths = sorted(p for p in LEGACY_ROOT.glob("*.zip") if p.is_file())
if not zip_paths:
    raise SystemExit(f"No root-level ZIP archives found under {LEGACY_ROOT}")

for archive in zip_paths:
    try:
        with zipfile.ZipFile(archive) as zf:
            bad_member = zf.testzip()
            if bad_member is not None:
                raise SystemExit(f"Corrupt member in {archive.name}: {bad_member}")
            file_count = 0
            for info in zf.infolist():
                if info.is_dir():
                    continue
                file_count += 1
                # Do not extract. Hash the member's bytes in memory only.
                data = zf.read(info)
                member_path = info.filename
                digest = hashlib.sha256(data).hexdigest()
                decision = decisions.get(member_path, "UNMAPPED_REQUIRES_REVIEW")
                row = {
                    "archive": archive.name,
                    "member_path": member_path,
                    "content_sha256": digest,
                    "size_bytes": len(data),
                    "crc32": f"{info.CRC:08x}",
                    "target_path_tracked": str(member_path in tracked_paths).lower(),
                    "manifest_decision": decision,
                }
                occurrence_rows.append(row)
                by_identity[(member_path, digest)].append(row)
            archive_summaries.append({
                "archive": archive.name,
                "archive_bytes": archive.stat().st_size,
                "file_entries": file_count,
                "valid_zip": True,
            })
    except zipfile.BadZipFile as exc:
        raise SystemExit(f"Invalid ZIP archive {archive.name}: {exc}") from exc

occurrence_rows.sort(key=lambda r: (str(r["archive"]), str(r["member_path"]), str(r["content_sha256"])))
with (OUT / "legacy-member-provenance.csv").open("w", newline="", encoding="utf-8") as stream:
    writer = csv.DictWriter(stream, fieldnames=[
        "archive", "member_path", "content_sha256", "size_bytes", "crc32",
        "target_path_tracked", "manifest_decision",
    ])
    writer.writeheader()
    writer.writerows(occurrence_rows)

unique_rows = []
for (member_path, digest), rows in sorted(by_identity.items()):
    decisions_for_path = sorted({str(r["manifest_decision"]) for r in rows})
    target_present = any(r["target_path_tracked"] == "true" for r in rows)
    unique_rows.append({
        "member_path": member_path,
        "content_sha256": digest,
        "size_bytes": rows[0]["size_bytes"],
        "archive_occurrences": len(rows),
        "source_archives": ";".join(sorted({str(r["archive"]) for r in rows})),
        "target_path_tracked": str(target_present).lower(),
        "manifest_decisions": ";".join(decisions_for_path),
    })

with (OUT / "legacy-unique-path-hashes.csv").open("w", newline="", encoding="utf-8") as stream:
    writer = csv.DictWriter(stream, fieldnames=[
        "member_path", "content_sha256", "size_bytes", "archive_occurrences",
        "source_archives", "target_path_tracked", "manifest_decisions",
    ])
    writer.writeheader()
    writer.writerows(unique_rows)

unmapped_paths = sorted({str(r["member_path"]) for r in occurrence_rows if r["manifest_decision"] == "UNMAPPED_REQUIRES_REVIEW"})
manifest_paths = sorted(decisions)
summary = {
    "legacy_source_ref": "217f98ecc800aa64ae4739d27ed2aeb95dd260ed",
    "archives_found": len(zip_paths),
    "archive_summaries": archive_summaries,
    "archive_file_occurrences": len(occurrence_rows),
    "unique_member_path_content_pairs": len(unique_rows),
    "unique_member_paths": len({str(r["member_path"]) for r in occurrence_rows}),
    "manifest_rows": len(manifest_paths),
    "manifest_paths_present_in_archive": sum(1 for p in manifest_paths if any(r["member_path"] == p for r in occurrence_rows)),
    "unmapped_unique_paths": len(unmapped_paths),
    "unmapped_unique_path_sample": unmapped_paths[:100],
    "secret_values_emitted": False,
    "archive_members_extracted": False,
    "archive_members_executed": False,
}
(OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in summary.items() if k != "unmapped_unique_path_sample"}, indent=2))
