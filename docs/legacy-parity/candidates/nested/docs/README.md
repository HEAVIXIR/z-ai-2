# HEAVIX — Executable Hardening Patch V1.0

این بسته فقط شامل اصلاحات **قطعی و کم‌ریسک قابل اعمال خودکار** است و ادعا نمی‌کند تمام 101 مسیر Admin را بدون بازبینی معنایی به Permissionهای دقیق مجهز کرده است.

## اصلاحات داخل بسته

1. حل Conflict فعلی:
   - `next-auth@4.24.11`
   - `nodemailer@10.x`
   - Nodemailer به `^7.0.7` تغییر داده شده تا peer dependency سازگار شود.

2. Build/Start استاندارد Node.js:
   - حذف وابستگی Build به `cp` و Start به `bun`.
   - آماده‌سازی standalone با `scripts/prepare-standalone.mjs`.

3. Build دیگر خطاهای TypeScript را مخفی نمی‌کند:
   - `ignoreBuildErrors: false`

4. React Strict Mode فعال شده است.

5. Security headers پایه اضافه شده‌اند.

6. دو Gate حسابرسی اجرایی اضافه شده:
   - `npm run admin:rbac-audit`
   - `npm run ai:audit`

## نحوه اعمال

از ریشه پروژه:

```powershell
cd "D:\heavix support\chatgpt\کل پروژه\HEAVIX-COMPLETE-V1.2\heavix"
```

فایل‌های داخل این ZIP را روی پروژه کپی کن و جایگزین کن:

```text
package.json
next.config.ts
scripts/prepare-standalone.mjs
scripts/audit-admin-rbac.mjs
scripts/audit-ai-gateway.mjs
```

سپس:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npm run typecheck
npm run admin:rbac-audit
npm run ai:audit
npm run build
```

### نکته مهم

دو audit عمداً در صورت وجود Gap با exit code 2 متوقف می‌شوند. این رفتار حفاظتی است و به معنی خراب بودن Build نیست؛ یعنی قبل از Production باید Gapهای امنیتی بررسی شوند.

## مواردی که هنوز نیاز به اصلاح معنایی دارند

اینها عمداً به صورت کورکورانه patch نشده‌اند:

- تعیین Permission دقیق برای هر یک از 101 Admin route.
- انتقال کامل تمام AI routeها به Gateway.
- حذف fallback قدیمی `User.role` بعد از migration واقعی داده.
- EXIF stripping/re-encoding و Malware Scan.
- Payment webhook/idempotency.
- Object-level authorization.
- E2E/Security suite کامل.
- Backup/Restore verification.
- Queue/Worker Production.
- Canonical Location migration.

دلیل: این موارد نیازمند شناخت دقیق handler، domain action و دیتای واقعی هستند و patch خودکار عمومی می‌تواند امنیت یا رفتار فعلی سیستم را خراب کند.
