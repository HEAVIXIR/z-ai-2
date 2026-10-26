#!/usr/bin/env python3
"""Read-only inventory of archived legacy files versus this checkout; never extracts or executes them."""
import hashlib, re, zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
ROOT=Path(".").resolve(); ARCHIVE_DIR=Path("/tmp/heavix-legacy-archives")
OUT=ROOT/"docs/legacy-parity/archive-inventory.md"
ARCHIVES=[".zscripts.zip","bun.zip","db.zip","docs.zip","download.zip","examples.zip","mini-services.zip","prisma.zip","public.zip","scripts.zip","src.zip","tests.zip","upload.zip"]
MAX_MEMBER=100*1024*1024; MAX_TOTAL=2*1024*1024*1024; MAX_ROWS=100
SECRET=re.compile(r"(^|/)(\.env($|\.)|secrets?(/|$)|credentials?(/|$)|id_rsa|id_ed25519)(/|$)",re.I)
GENERATED=re.compile(r"(^|/)(node_modules|\.git|\.next|dist|build|coverage|vendor|\.turbo)(/|$)",re.I)
DUMP=re.compile(r"(^|/)[^/]*\.(sqlite3?|db|dump|bak|backup|sql\.gz)$",re.I)
KEY=re.compile(r"\.(pem|key|p12|pfx|jks)$",re.I)
def digest(data): return hashlib.sha256(data).hexdigest()
def safe_path(name):
 p=PurePosixPath(name.replace("\\","/"))
 if p.is_absolute() or any(x in ("..","") for x in p.parts): return None
 out=str(p)
 if out.startswith("./"): out=out[2:]
 return out if out and out!="." else None
def classify(path,info):
 if SECRET.search(path) or KEY.search(path): return "EXCLUDE_SECRET_OR_KEY"
 if DUMP.search(path) or path.lower().endswith(".before-restore") or "/backups/" in path.lower(): return "EXCLUDE_DATABASE_OR_BACKUP"
 if GENERATED.search(path): return "EXCLUDE_GENERATED_OR_VENDOR"
 if ((info.external_attr>>16)&0o170000)==0o120000: return "EXCLUDE_SYMLINK"
 if info.file_size>MAX_MEMBER: return "EXCLUDE_OVERSIZE"
 if path.lower().endswith((".exe",".dll",".so",".dylib",".bin",".wasm")): return "REVIEW_BINARY"
 return "CANDIDATE"
def show(title,rows,fn):
 if not rows: return "### "+title+"\n\nNone.\n"
 out=["### "+title+" — "+str(len(rows))]
 out += ["- "+fn(x) for x in rows[:MAX_ROWS]]
 if len(rows)>MAX_ROWS: out.append("- ... "+str(len(rows)-MAX_ROWS)+" additional rows omitted.")
 return "\n".join(out)+"\n"
totals=Counter(); cross=defaultdict(list); sections=[]
for archive in ARCHIVES:
 file=ARCHIVE_DIR/archive
 if not file.exists():
  sections.append("## "+archive+"\n\nERROR: download missing.\n"); totals["archive_error"]+=1; continue
 try: zf=zipfile.ZipFile(file)
 except Exception as exc:
  sections.append("## "+archive+"\n\nERROR: invalid ZIP ("+type(exc).__name__+").\n"); totals["archive_error"]+=1; continue
 infos=[i for i in zf.infolist() if not i.is_dir()]
 valid=[(i,safe_path(i.filename)) for i in infos]
 totals["unsafe_path"]+=sum(p is None for _,p in valid); valid=[(i,p) for i,p in valid if p]
 stem=archive[:-4]; prefixed=bool(valid) and all(p==stem or p.startswith(stem+"/") for _,p in valid)
 local=Counter(); missing=[]; conflicts=[]; identical=[]; excluded=[]; binaries=[]; total_bytes=0
 for info,member in valid:
  if archive=="bun.zip": path=member[4:] if member.startswith("bun/") else member
  else: path=member if prefixed else stem+"/"+member
  total_bytes+=info.file_size
  if total_bytes>MAX_TOTAL: local["archive_size_limit"]+=1; break
  kind=classify(path,info)
  if kind.startswith("EXCLUDE"): excluded.append((path,kind)); local[kind]+=1; continue
  try: data=zf.read(info)
  except Exception: local["read_error"]+=1; continue
  h=digest(data); cross[path].append((archive,h))
  review_exports={"scripts/catalog-health.ts","scripts/security-check.ts","prisma/seed-price-records.ts","scripts/rebuild-taxonomy.ts","scripts/seed-store-comprehensive.ts"}
  if path in review_exports and not (ROOT/path).is_file():
   candidate=ROOT/"docs/legacy-parity/candidates"/path
   candidate.parent.mkdir(parents=True,exist_ok=True)
   candidate.write_bytes(data)
  if kind=="REVIEW_BINARY": binaries.append((path,len(data),h)); local["review_binary"]+=1; continue
  current=ROOT/path
  if current.is_file():
   try: old=digest(current.read_bytes())
   except OSError: old="UNREADABLE_CURRENT_FILE"
   if old==h: identical.append(path); local["identical"]+=1
   else: conflicts.append((path,h,old)); local["conflict"]+=1
  elif current.exists(): conflicts.append((path,h,"CURRENT_PATH_IS_NOT_FILE")); local["conflict"]+=1
  else: missing.append((path,len(data),h)); local["missing"]+=1
 zf.close(); totals.update(local)
 sections.append("\n".join([
  "## "+archive+"\n","- Archive bytes: "+format(file.stat().st_size,","),
  "- Archive SHA-256: "+digest(file.read_bytes()),
  "- ZIP entries: "+str(len(infos))+"; normalized prefix retained: "+str(prefixed),
  "- Uncompressed bytes examined: "+format(total_bytes,","),
  "- Counts: "+", ".join(k+"="+str(v) for k,v in sorted(local.items())),"",
  show("Missing candidates (not imported)",missing,lambda x:x[0]+" ("+format(x[1],",")+" bytes; sha256 "+x[2][:16]+")"),
  show("Path conflicts / different content",conflicts,lambda x:x[0]+" (archive "+x[1][:16]+", current "+x[2][:16]+")"),
  show("Identical files",identical,lambda x:x),
  show("Excluded files",excluded,lambda x:x[0]+" — "+x[1]),
  show("Binary files requiring manual review",binaries,lambda x:x[0]+" ("+format(x[1],",")+" bytes; sha256 "+x[2][:16]+")")
 ]))
collisions=[(p,rows) for p,rows in sorted(cross.items()) if len({h for _,h in rows})>1]
OUT.parent.mkdir(parents=True,exist_ok=True)
report=[
 "# Legacy ZIP archive inventory — read-only","",
 "Source pinned to HEAVIXIR/z at commit 217f98ecc800aa64ae4739d27ed2aeb95dd260ed; compared against the checked-out target branch.",
 "No archive content is extracted into the repository or executed. This report does not authorize import.","",
 "## Summary","",
 "- Archives expected: "+str(len(ARCHIVES)),
 "- Missing path candidates: "+str(totals["missing"]),
 "- Same-path content conflicts: "+str(totals["conflict"]),
 "- Identical files: "+str(totals["identical"]),
 "- Excluded entries: "+str(sum(v for k,v in totals.items() if k.startswith("EXCLUDE_"))),
 "- Binary entries requiring review: "+str(totals["review_binary"]),
 "- Unsafe paths skipped: "+str(totals["unsafe_path"]),
 "- Archive errors: "+str(totals["archive_error"]),
 "- Cross-archive paths with different hashes: "+str(len(collisions)),"",
 "## Import policy","",
 "- A missing path is not automatically safe or useful to import; review feature relevance, licensing, secrets, dependencies and architecture.",
 "- Resolve conflicts semantically; never overwrite current files based on age or size.",
 "- Database dumps, secrets, environment files, generated output, vendor dependencies and runtime bundles are not migration candidates.","",
 *sections,"## Cross-archive collisions",""
]
for path,rows in collisions[:MAX_ROWS]: report.append("- "+path+": "+", ".join(a+"="+h[:12] for a,h in rows))
if len(collisions)>MAX_ROWS: report.append("- ... "+str(len(collisions)-MAX_ROWS)+" additional collisions omitted.")
OUT.write_text("\n".join(report)+"\n",encoding="utf-8")
print("\n".join(report[:22])); print("\nFull report: "+str(OUT))
