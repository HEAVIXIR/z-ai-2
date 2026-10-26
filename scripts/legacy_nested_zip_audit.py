#!/usr/bin/env python3
"""Read-only inventory of nested ZIPs stored inside upload.zip; never extracts or executes files."""
import hashlib, io, re, zipfile
from pathlib import Path, PurePosixPath
ROOT=Path(".").resolve()
SOURCE=Path("/tmp/heavix-legacy-archives/upload.zip")
OUT=ROOT/"docs/legacy-parity/nested-archive-inventory.md"
NESTED={"upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip","upload/heavix-postgres-migration-changes.zip","upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip"}
SECRET=re.compile(r"(^|/)(\.env($|\.)|secrets?(/|$)|credentials?(/|$)|id_rsa|id_ed25519)(/|$)",re.I)
DUMP=re.compile(r"(^|/)[^/]*\.(sqlite3?|db|dump|bak|backup|sql\.gz)$",re.I)
KEY=re.compile(r"\.(pem|key|p12|pfx|jks)$",re.I)
def sha(data): return hashlib.sha256(data).hexdigest()
def safe(name):
 p=PurePosixPath(name.replace("\\","/"))
 if p.is_absolute() or any(x in ("..","") for x in p.parts): return None
 out=str(p)
 if out.startswith("./"): out=out[2:]
 return out if out and out!="." else None
def classify(path,info):
 if SECRET.search(path) or KEY.search(path): return "EXCLUDE_SECRET_OR_KEY"
 if DUMP.search(path) or path.lower().endswith(".before-restore") or "/backups/" in path.lower(): return "EXCLUDE_DATABASE_OR_BACKUP"
 if ((info.external_attr>>16)&0o170000)==0o120000: return "EXCLUDE_SYMLINK"
 if info.file_size>100*1024*1024: return "EXCLUDE_OVERSIZE"
 if path.lower().endswith((".exe",".dll",".so",".dylib",".bin",".wasm")): return "REVIEW_BINARY"
 return "CANDIDATE"
if not SOURCE.exists(): raise SystemExit("upload.zip not downloaded")
outer=zipfile.ZipFile(SOURCE)
reports=["# Nested ZIP archive inventory — read-only","","Nested ZIPs embedded in upload.zip were inspected in memory only; no files were extracted or executed.",""]
for info in outer.infolist():
 if info.is_dir() or info.filename not in NESTED: continue
 blob=outer.read(info)
 try: nested=zipfile.ZipFile(io.BytesIO(blob))
 except Exception as exc:
  reports += ["## "+info.filename,"","ERROR: invalid nested ZIP ("+type(exc).__name__+").",""]
  continue
 missing=[]; conflicts=[]; identical=[]; excluded=[]; unsafe=0
 for item in nested.infolist():
  if item.is_dir(): continue
  path=safe(item.filename)
  if not path: unsafe+=1; continue
  kind=classify(path,item)
  if kind.startswith("EXCLUDE"): excluded.append((path,kind)); continue
  if kind=="REVIEW_BINARY": excluded.append((path,kind)); continue
  try: data=nested.read(item)
  except Exception: conflicts.append((path,"READ_ERROR","")); continue
  if path in {"docs/README.md","scripts/prepare-standalone.mjs","scripts/audit-ai-gateway.mjs","scripts/audit-admin-rbac.mjs"}:
   candidate=ROOT/"docs/legacy-parity/candidates/nested"/path
   candidate.parent.mkdir(parents=True,exist_ok=True)
   candidate.write_bytes(data)
  h=sha(data); target=ROOT/path
  if target.is_file():
   try: current=sha(target.read_bytes())
   except OSError: current="UNREADABLE_CURRENT_FILE"
   if current==h: identical.append((path,h))
   else: conflicts.append((path,h,current))
  elif target.exists(): conflicts.append((path,h,"CURRENT_PATH_IS_NOT_FILE"))
  else: missing.append((path,len(data),h))
 reports += ["## "+info.filename,"","- Compressed bytes: "+str(len(blob)),"- ZIP entries: "+str(len(nested.infolist())),"- Missing candidates: "+str(len(missing)),"- Same-path conflicts: "+str(len(conflicts)),"- Identical files: "+str(len(identical)),"- Excluded/special-review entries: "+str(len(excluded)),"- Unsafe paths skipped: "+str(unsafe),""]
 for title,rows in [("Missing candidates",missing),("Conflicts",conflicts),("Identical files",identical),("Excluded or special review",excluded)]:
  reports.append("### "+title+" — "+str(len(rows)))
  for row in rows[:200]:
   if title=="Missing candidates": reports.append("- "+row[0]+" ("+str(row[1])+" bytes; sha256 "+row[2][:16]+")")
   elif title=="Conflicts": reports.append("- "+row[0]+" (archive "+row[1][:16]+", current "+row[2][:16]+")")
   elif title=="Identical files": reports.append("- "+row[0]+" (sha256 "+row[1][:16]+")")
   else: reports.append("- "+row[0]+" — "+row[1])
  if len(rows)>200: reports.append("- ... "+str(len(rows)-200)+" additional entries omitted.")
  reports.append("")
 nested.close()
outer.close()
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text("\n".join(reports)+"\n",encoding="utf-8")
print("\n".join(reports[:80]))
print("Full report: "+str(OUT))
