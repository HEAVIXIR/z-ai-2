#!/usr/bin/env python3
"""Read-only inventory of the ZIP bundles in HEAVIXIR/z.

Does not extract archive members, execute legacy scripts, or print matched secret values.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath

TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc",
    ".prisma", ".sql", ".md", ".mdx", ".yml", ".yaml", ".sh", ".bash",
    ".py", ".toml", ".ini", ".conf", ".config", ".css", ".scss", ".html",
    ".xml", ".svg", ".txt", ".env", ".example", ".properties",
}
RISKY_PATH = re.compile(
    r"(^|/)(\.env(?:\..*)?|.*(?:secret|credential|private.?key|id_rsa|id_ed25519).*|"
    r".*(?:dump|backup|snapshot|production|prod-db).*\.(?:sql|dump|bak|sqlite|db)|"
    r"node_modules|\.git)(/|$)",
    re.IGNORECASE,
)
CANDIDATE_PATH = re.compile(
    r"(^|/)(package\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock|"
    r"schema\.prisma|migration\.sql|next\.config\.[^/]+|"
    r"route\.(?:ts|js)|middleware\.(?:ts|js)|Dockerfile|"
    r"docker-compose[^/]*|.*\.(?:prisma|sql))$",
    re.IGNORECASE,
)
SECRET_PATTERNS = [
    ("private-key-material", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("credential-assignment", re.compile(
        r"(?i)\b(?:DATABASE_URL|STORE_DATABASE_URL|(?:API|AUTH|ACCESS|REFRESH|SESSION)?_?TOKEN|"
        r"(?:API|APP|CLIENT|DATABASE|DB|JWT|SESSION|AUTH)?_?SECRET|PASSWORD|PRIVATE_KEY)\b"
        r"\s*[:=]\s*['\"]?(?!\$\{|<|your[_ -]|replace[_ -]|example|changeme|placeholder)"
        r"[A-Za-z0-9_./:@+=-]{12,}"
    )),
]
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_ENTRIES_PER_ARCHIVE = 250_000


def safe_member_name(name: str) -> bool:
    p = PurePosixPath(name)
    return not p.is_absolute() and ".." not in p.parts and not re.match(r"^[A-Za-z]:", name)


def inspect_archive(path: Path, report_lines: list[str], findings: list[dict]) -> dict:
    archive_result = {
        "archive": path.name,
        "bytes": path.stat().st_size,
        "valid_zip": False,
        "entries": 0,
        "files": 0,
        "directories": 0,
        "unsafe_paths": 0,
        "symlinks": 0,
        "sensitive_path_candidates": 0,
        "code_config_candidates": 0,
        "text_files_scanned": 0,
        "secret_pattern_hits": 0,
        "extension_counts": collections.Counter(),
        "path_candidates": [],
    }
    report_lines.append(f"\n## ARCHIVE {path.name} ({path.stat().st_size} bytes)")
    try:
        with zipfile.ZipFile(path) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_ENTRIES_PER_ARCHIVE:
                report_lines.append(f"BLOCKED: {len(infos)} entries exceeds safety cap {MAX_ENTRIES_PER_ARCHIVE}")
                return archive_result
            archive_result["valid_zip"] = True
            archive_result["entries"] = len(infos)
            report_lines.append(f"entries={len(infos)}")
            for info in infos:
                name = info.filename
                if not safe_member_name(name):
                    archive_result["unsafe_paths"] += 1
                    findings.append({"archive": path.name, "path": name, "kind": "unsafe-archive-path"})
                    continue
                mode = info.external_attr >> 16
                if stat.S_ISLNK(mode):
                    archive_result["symlinks"] += 1
                    findings.append({"archive": path.name, "path": name, "kind": "symlink"})
                if info.is_dir():
                    archive_result["directories"] += 1
                    continue
                archive_result["files"] += 1
                suffix = PurePosixPath(name).suffix.lower() or "[no-extension]"
                archive_result["extension_counts"][suffix] += 1
                if RISKY_PATH.search(name):
                    archive_result["sensitive_path_candidates"] += 1
                    findings.append({"archive": path.name, "path": name, "kind": "sensitive-path-review"})
                if CANDIDATE_PATH.search(name):
                    archive_result["code_config_candidates"] += 1
                    if len(archive_result["path_candidates"]) < 3000:
                        archive_result["path_candidates"].append(name)
                report_lines.append(f"FILE\t{info.file_size}\t{info.compress_size}\t{name}")
                if suffix not in TEXT_SUFFIXES or info.file_size > MAX_TEXT_BYTES:
                    continue
                try:
                    with zf.open(info) as stream:
                        data = stream.read(MAX_TEXT_BYTES + 1)
                    if len(data) > MAX_TEXT_BYTES or b"\x00" in data[:8192]:
                        continue
                    text = data.decode("utf-8", errors="ignore")
                except (OSError, RuntimeError, zipfile.BadZipFile):
                    continue
                archive_result["text_files_scanned"] += 1
                for line_no, line in enumerate(text.splitlines(), start=1):
                    for kind, pattern in SECRET_PATTERNS:
                        if pattern.search(line):
                            archive_result["secret_pattern_hits"] += 1
                            findings.append({
                                "archive": path.name,
                                "path": name,
                                "kind": kind,
                                "line": line_no,
                                "value_redacted": True,
                            })
                            break
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        report_lines.append(f"INVALID_OR_UNREADABLE_ZIP: {type(exc).__name__}")
        return archive_result

    report_lines.append(
        "SUMMARY\t" + json.dumps({
            k: v for k, v in archive_result.items()
            if k not in {"extension_counts", "path_candidates"}
        }, sort_keys=True)
    )
    report_lines.append("EXTENSIONS\t" + json.dumps(archive_result["extension_counts"].most_common(30)))
    report_lines.append("CANDIDATE_PATHS\t" + json.dumps(archive_result["path_candidates"]))
    return archive_result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path, help="Clone of HEAVIXIR/z")
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    archives = sorted(p for p in args.root.glob("*.zip") if p.is_file())
    report_lines = [
        "# HEAVIX legacy archive inventory",
        "READ-ONLY: no archive member is extracted or executed.",
        "Secret scan records path/category/line only; matched values are never included.",
        f"root={args.root}",
        f"top_level_zip_count={len(archives)}",
    ]
    findings: list[dict] = []
    results = [inspect_archive(p, report_lines, findings) for p in archives]
    summary = {
        "archive_count": len(results),
        "valid_archives": sum(bool(x["valid_zip"]) for x in results),
        "total_entries": sum(x["entries"] for x in results),
        "total_files": sum(x["files"] for x in results),
        "unsafe_paths": sum(x["unsafe_paths"] for x in results),
        "symlinks": sum(x["symlinks"] for x in results),
        "sensitive_path_candidates": sum(x["sensitive_path_candidates"] for x in results),
        "code_config_candidates": sum(x["code_config_candidates"] for x in results),
        "text_files_scanned": sum(x["text_files_scanned"] for x in results),
        "secret_pattern_hits": sum(x["secret_pattern_hits"] for x in results),
        "finding_count": len(findings),
    }
    report_lines += [
        "\n## AGGREGATE SUMMARY",
        json.dumps(summary, indent=2, sort_keys=True),
        "\n## REVIEW FINDINGS (no secret values)",
        json.dumps(findings, indent=2, sort_keys=True),
        "\n## IMPORT POLICY",
        "- This inventory is evidence only; it does not approve wholesale import.",
        "- Review each candidate against current routes, Prisma schemas/migrations, RBAC, tests, and current assets.",
        "- Never import credentials, production database dumps, generated clients, node_modules, or executable legacy migration/backup scripts without a separate explicit review.",
    ]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print("FINDINGS_REDACTED")
    for finding in findings:
        print(json.dumps(finding, sort_keys=True))
    print("ARCHIVE_SUMMARY")
    for item in results:
        print(json.dumps({
            "archive": item["archive"],
            "bytes": item["bytes"],
            "valid_zip": item["valid_zip"],
            "entries": item["entries"],
            "files": item["files"],
            "sensitive_path_candidates": item["sensitive_path_candidates"],
            "code_config_candidates": item["code_config_candidates"],
            "text_files_scanned": item["text_files_scanned"],
            "secret_pattern_hits": item["secret_pattern_hits"],
        }, sort_keys=True))
    print(f"REPORT_PATH={args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
