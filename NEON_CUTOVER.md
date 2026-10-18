# HuuQa CMS Recovery — Neon Free Cutover

**Status (18 October 2026):** Neon database, Managed Auth and Data API provisioned; 7 CMS keys copied and **all seven md5(value::text) checksums match** the Supabase source. Figma Make source patch staged, **not automatically published**. No original Supabase database writes or deletions.

## Existing data
- Original Supabase project: `onitstcxsivzpclvdkba` (read-only source of snapshot).
- New Neon Free project: `dawn-poetry-39561209`; branch `br-blue-sun-aodu3zd7`, database `huuqacms`, region `aws-ap-southeast-1`.
- Public Neon Auth URL (not a password): `https://ep-solitary-fire-ao4s6d80.neonauth.c-2.ap-southeast-1.aws.neon.tech/huuqacms/auth`
- Public Neon Data API URL: `https://ep-solitary-fire-ao4s6d80.apirest.c-2.ap-southeast-1.aws.neon.tech/huuqacms/rest/v1`
- Data: 239 menu entries, 14 categories, settings/content/seo/revision/seed version.
- Old menu and new Neon snapshot are identical. **The changes reported by the site owner that were never saved are not present in the accessible data.** Re-enter additions/removals/edits into the restored CMS once publishing is active; do not falsely claim they were restored.

## Figma Make handoff — six files

Copy the following files from THIS repository to the same paths in Figma Make. They are exact replacement files, not snippets:
1. `package.json` — adds `@neondatabase/neon-js@0.8.0-beta` as browser SDK.
2. `src/app/utils/neonCms.ts` — NEW; Neon Auth and Data API client.
3. `src/app/utils/cms.ts` — REPLACE; Neon preferred reads and Neon-only writes; old Supabase read fallback; image upload still uses old Storage.
4. `src/app/components/NeonAdminGate.tsx` — NEW; secure Neon sign-up and sign-in.
5. `src/app/pages/admin/AdminLayout.tsx` — REPLACE; wrap the admin UI with the secure session gate.
6. `src/app/App.tsx` — REPLACE; version bump to 11 so visitors refresh the cached CMS after cutover.

Also keep the earlier `src/app/hooks/useLiveData.ts` emergency fallback file (bundled 239-item menu if both remote providers fail).

## Security behavior

Anonymous visitors have **SELECT only** on `public.cms_store` (via RLS); `anonymous` receives no INSERT/UPDATE/DELETE grants. Signed-in `authenticated` users have INSERT/UPDATE only if their JWT `sub` matches a whitelisted entry in `huuqaprivate.cms_admins`; no write accounts are whitelisted initially. The site owner must sign up or sign in using Neon Auth and tell the maintainer the email address (not password) to approve; only then can authenticated CMS edits publish. The prior website login remains, so this is currently a second, server-verified login. Never add browser-shared admin tokens or relax RLS for convenience.

Neon Auth trusted origins registered: `https://huqaalusail.com`, `https://www.huqaalusail.com`. Figma Make preview origin may need separate whitelisting if testing there.

## Verification plan

- Ensure Figma Make resolves the new package version, builds successfully, and loads on the public site.
- Test a fresh/incognito browser visitor can read all 239 items without hitting Supabase (check Network requests to Neon).
- Sign up for Neon CMS admin using an email YOU control. Approve the resulting `neon_auth.user.id` into `huuqaprivate.cms_admins` via trusted Neon connector; no credentials in GitHub.
- Test add, edit, and delete **one reversible test item**; check Neon `cms_store` and `cms:revision`; then remove test item. This test edits Neon but never legacy Supabase.
- Verify a guest/browser cannot perform any CMS write (RLS must reject).
- Check image URLs: most menu images use Cloudways; old Supabase-hosted images may still be blocked by cached-egress 402. Image upload currently remains on original Supabase Storage; **do not claim it is solved**.

## Rollback

No original Supabase data changed. Revert the six cutover files in Figma Make if frontend integration fails; the existing bundled fallback menu remains safe. Do not delete the Neon backup or reset local CMS caches again without exporting a backup.

**Runtime disclaimer:** Database copy, checksums, grants, RLS policies, Auth and Data API readiness were verified via connected tools. Frontend build, Neon anonymous browser token, CMS sign-in, and end-to-end publishing require testing on Figma Make after the code handoff.
