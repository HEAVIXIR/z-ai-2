
#!/usr/bin/env python3
from pathlib import Path
import re, sys, subprocess

ROOT=Path.cwd()
checks={
"src/lib/auth.ts":[r"ADMIN_COOKIE",r"AdminSession",r'(?<![A-Za-z])id:\s*"ADMIN"',r"validateLogin",r"createSession"],
"src/lib/authorization/index.ts":[r"userId\s*===\s*['\"]ADMIN['\"]"],
"src/app/api/auth/login/route.ts":[r"validateLogin",r"createSession",r"ADMIN_USERNAME",r"\busername\b"],
"src/middleware.ts":[r"heavix-admin",r"ADMIN_COOKIE"],
"src/lib/ai-policy.ts":[r"user\.role",r"select:\s*\{\s*role:\s*true\s*\}"],
"src/lib/seller-service.ts":[r'role:\s*"SELLER"'],
}
failed=False
for f,pats in checks.items():
    s=(ROOT/f).read_text(encoding="utf-8")
    for pat in pats:
        if re.search(pat,s):
            print("FAIL",f,pat); failed=True
if not (ROOT/"tests/contract/r45-canonical-auth-contract.test.ts").exists():
    print("FAIL missing regression test"); failed=True
print("\nGit status:")
subprocess.run(["git","status","--short"],check=False)
sys.exit(1 if failed else 0)
