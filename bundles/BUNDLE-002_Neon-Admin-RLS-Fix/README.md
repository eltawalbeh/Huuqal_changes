# BUNDLE-002 — Neon Admin RLS Fix

**Date:** 2026-10-19 (Jordan)  
**Project:** HuuQa Lusail  
**Status:** Prepared — needs transfer into Figma Make and runtime verification  
**Issue:** "Neon CMS publishing denied: new row violates row-level security policy for table cms_store."

## Changed files only

Copy each complete file in this bundle into its ORIGINAL matching location in Figma Make. **Do not copy the bundles/BUNDLE-002_Neon-Admin-RLS-Fix/ prefix**.

| # | Bundle source file | Destination in Figma Make | Action |
|---|---|---|---|
| 1 | [src/app/utils/neonCms.ts](src/app/utils/neonCms.ts) | `src/app/utils/neonCms.ts` | **REPLACE** |
| 2 | [src/app/components/NeonAdminGate.tsx](src/app/components/NeonAdminGate.tsx) | `src/app/components/NeonAdminGate.tsx` | **REPLACE** |
| 3 | [src/app/pages/admin/AdminLayout.tsx](src/app/pages/admin/AdminLayout.tsx) | `src/app/pages/admin/AdminLayout.tsx` | **REPLACE** |

**No other files from BUNDLE-001 need to be copied again.**

## The actual failure and mitigation

The approved Neon user is recorded correctly in `huuqaprivate.cms_admins`. SQL tested an INSERT/ON-CONFLICT UPDATE as the `authenticated` role with that user's JWT `sub` in a transaction, and **the RLS check passed**. A savepoint was rolled back, preserving the live menu. Therefore, do not disable RLS or grant anonymous writes.

Neon's SDK supports `allowAnonymous: true` for public reads. This bundle uses TWO distinct clients:
- `neonClient`: public frontend data access, using guest tokens when no user signs in.
- `neonAdminClient`: sign-in and CMS writes with `allowAnonymous: false`. It cannot silently use guest credentials during save.

The server-side `public.cms_publish_access()` RPC was created directly on Neon; callable only by `authenticated`, and returns flags `signed_in`, `approved`, and `role`, **not tokens or secrets**. Its function and permissions were verified with a synthetic authenticated JWT claim; Neon Data API schema cache was refreshed.

Before saving, the client checks for a valid Neon session, email verification, and server-confirmed admin approval. If not recognized, it returns an actionable error rather than blindly calling upsert.

## Rollout test

1. Copy all three exact files into Figma Make, build/preview first, and then Publish.
2. Open Admin, SIGN OUT from both legacy and Neon sessions then sign back into Neon CMS with your own account.
3. Go to Menu Manager. Make one temporary, reversible edit and Save.
4. Verify change appears in another browser. Restore original value and Save.
5. If the new error says "publishing permission check failed" or "Token role", copy the exact text (no password or JWT) for the next diagnosis. This signals a client/JWT or browser-session issue.
6. If save succeeds, do not repeat BUNDLE-002. For later fixes, stage another new numbered bundle.

## Boundaries

- This bundle **has not been published** via Figma Make by the assistant. Source was saved to staging GitHub only.
- Does not update original Supabase; no changes to 239 menu records were made.
- SQL policy restrictions remain intact. Anonymous users have SELECT only; no anonymous write grants were added.
- Uploading new media still relies on legacy Supabase Storage and may fail with HTTP 402.
