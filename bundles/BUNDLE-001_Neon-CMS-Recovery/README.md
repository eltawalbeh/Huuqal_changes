# BUNDLE-001 — Neon CMS Recovery

**Date:** 2026-10-19 (Jordan)  
**Project:** HuuQa Lusail  
**Status:** STAGED IN GITHUB — NOT YET PUBLISHED IN FIGMA MAKE  
**Purpose:** Switch CMS read/write to independent Neon Free backend while preserving the original Supabase as an untouched backup.

## Exact file transfer map

The files inside this bundle are copies of the complete source files. **Copy the CONTENT of each bundle file to its corresponding original Figma Make path. Do not copy the `bundles/BUNDLE-001_Neon-CMS-Recovery/` prefix into your live project's directory.**

| # | Bundle file | Destination path in Figma Make | Action | Change |
|---|---|---|---|---|
| 1 | [`package.json`](./package.json) | `package.json` | **REPLACE** | Neon browser SDK dependency |
| 2 | [`src/app/utils/neonCms.ts`](./src/app/utils/neonCms.ts) | `src/app/utils/neonCms.ts` | **NEW** | Neon CMS client |
| 3 | [`src/app/utils/cms.ts`](./src/app/utils/cms.ts) | `src/app/utils/cms.ts` | **REPLACE** | Read from Neon first and write to Neon only |
| 4 | [`src/app/components/NeonAdminGate.tsx`](./src/app/components/NeonAdminGate.tsx) | `src/app/components/NeonAdminGate.tsx` | **NEW** | Neon verified login gate |
| 5 | [`src/app/pages/admin/AdminLayout.tsx`](./src/app/pages/admin/AdminLayout.tsx) | `src/app/pages/admin/AdminLayout.tsx` | **REPLACE** | Protect admin panel through Neon session |
| 6 | [`src/app/App.tsx`](./src/app/App.tsx) | `src/app/App.tsx` | **REPLACE** | Increment CMS cache version for re-sync |

## How to deploy safely

1. Duplicate/backup your current Figma Make project first.
2. Transfer all **6** files listed above; do not transfer only some of them.
3. Let Figma Make install the new `@neondatabase/neon-js` dependency and check for compilation errors.
4. Validate on preview before publishing: public menu, 239 items, category lists, all language versions, admin page, and frontend console errors.
5. Create/sign into Neon account using an email you control. The account MUST be approved in server-side `huuqaprivate.cms_admins` (user ID allowlist) before any CMS write can succeed.
6. Test an authorized temporary menu edit, save, observe it on visitor frontend, then revert the temporary edit. Check that anonymous visitors cannot write.
7. Publish only after the above passes.

## Scope and cautions

- The new Neon project has **239 items and 14 categories** in the snapshot; all seven CMS keys matched original Supabase hashes when copied.
- These are the **last saved backend records**, not a recovery of edits that failed to save. Any newer additions/edits/deletions absent from original Supabase must be entered after admin writes are working.
- New files have **not** been deployed into Figma Make automatically. This bundle exists only in the staging GitHub repository.
- The menu emergency fallback file `src/app/hooks/useLiveData.ts` already landed in the original Figma Make repository in an earlier change; it is **not** part of this bundle, so don't overwrite it.
- Image uploads still target old Supabase Storage and may hit HTTP 402; this bundle **does not** claim to solve media upload or caching.
- No Supabase data deleted or modified.
- If a Figma Make preview domain differs from the configured approved origins, configure Neon Auth trusted domains before testing admin login.
- Do not publish or share any secret/database password or use a client-side admin token.

## Versioning convention

Every next change gets **a new bundle** (`BUNDLE-002_...`, `BUNDLE-003_...`). Do not silently overwrite older bundles. Each bundle contains only changed/new files with the exact paths and a `README.md` transfer manifest.
