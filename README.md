# HuuQa Lusail — CMS Request Audit & Browser Cache Fix

**Patch date:** 18 October 2026  
**Read-only source:** [eltawalbeh/Huuqalusail](https://github.com/eltawalbeh/Huuqalusail), `main` commit `46956c2a89c716416cb7590084fc03e7d489e023`  
**Handoff destination:** [eltawalbeh/Huuqal_changes](https://github.com/eltawalbeh/Huuqal_changes), `main`  
**Status:** Code changes staged for manual integration in Figma Make; **NOT deployed**. Original repo and production Supabase data were not changed.

## Copy these exact files into Figma Make

This is a **patch-only repository**, not a full replacement application. Replace the content of the corresponding existing Figma Make files (same relative paths) **one file at a time**:

| Sequence | Exact destination path | What changed |
|---|---|---|
| 1 | `src/app/utils/cmsSyncPolicy.js` | Public revision check interval from 60 seconds to 15 minutes. |
| 2 | `src/app/utils/cms.ts` | Deduplicate in-flight CMS reads; treat HTTP 402 as a service error rather than missing data; suppress cascaded fallback/retry attempts for one minute; stop redundant fallback writes; set 7-day browser cache on **future direct Storage uploads** using unique paths. |
| 3 | `src/app/App.tsx` | Prevent overlapping sync calls on focus + visibility events, retain last-known local data when Supabase errors occur, stop public visitors automatically seeding menu data into production, preserve a default SEO record in local cache. Admin focus refreshes are limited to once per minute. |
| 4 | `src/app/components/DatabaseStatus.tsx` | Dashboard health checks every five minutes rather than every minute. |
| 5 | `supabase/functions/server/index.tsx` | Set `cacheControl: '604800'` on **future Edge Function uploads** and support `categories`/`revision` CMS keys. |

There are **no** edits to images, uploaded Storage objects, site design, marketing content, database migrations, or production settings.

**Important:** Copying `supabase/functions/server/index.tsx` into Figma Make does *not necessarily deploy* the Edge Function. Check the actual Supabase Functions deployment separately before claiming Edge uploads or revision routes are updated. Do not redeploy a function with a mismatching slug/entrypoint. The client-side direct Storage fallback still receives its new cache header when that route is used.

## Deployment procedure

1. Open the original Figma Make project. Save a version/snapshot before editing.
2. Copy files 1–5 above to their **existing exact paths**, preserving the rest of the project.
3. Let Figma Make run its build and report TypeScript/import errors. Resolve any differences if Figma Make has newer code than the referenced source commit.
4. Test home/menu pages, navigation, language switching, promotional content, and local cached content both online and when Supabase returns HTTP 402.
5. Test admin settings/category/menu saves and verify that failed writes show errors rather than false success. Do not repeatedly test large uploads during a quota restriction.
6. Check the browser Network panel: one revision lookup per *cached public tab* at most every 15 minutes under normal conditions, no duplicate simultaneous syncs, no repeat PostgREST attempts on HTTP 402, and an appropriately cached response for **new** uploaded assets.
7. Deploy the Edge Function **only if its deployed slug/entrypoint is correctly configured**. Verify `/cms/revision`, `/cms/categories` and the upload behavior.
8. Publish the Figma Make site **only after** verifying. Push your resulting Figma Make changes to the original `Huuqalusail` repository. Compare its latest commit to these files.

## Test and verification

```sh
node --test tests/cache-audit.test.mjs
```

The tests target the standalone cache policy and enforce core source-code guardrails. The entire React/Vite project cannot be built from this **patch-only** repository; for full build/typecheck, apply these files to the original full application and run its Figma Make/Vite build.

**Verification status at handoff:** GitHub patch files committed and readable; source paths and static guardrails inspected. Full Figma Make build, runtime/network regression, and deployed Supabase Edge Function behavior **not yet verified**.

## What this changes — and what it does not

- The 60-second to 15-minute revision interval reduces expected public CMS *revision checks* by 15× while tabs are active and events request checks; it does not guarantee a 15× reduction in total traffic.
- Multiple simultaneous focus/visibility events no longer independently trigger full CMS synchronization; in-flight CMS queries to the same section are shared.
- Supabase quota HTTP 402 stops fallback attempts and triggers a one-minute in-tab cooldown.
- **Existing 53 Storage images are unchanged** and still have their old `no-cache` browser TTL metadata. Seven-day caching applies only to **new uploads after the code is deployed**; this alone cannot retroactively fix 6.15 GB already consumed or remove Supabase quota restrictions.
- Cached browser content may be up to **15 minutes old** unless refreshed via another mechanism. This is the explicit bandwidth/freshness trade-off.
- **Image optimization is intentionally postponed** (no WebP conversion, compression, re-upload, resizing, or deletion).

## Additional security findings — require a separate approved migration

The original project contains a **hardcoded administrative password in client-side source** (`src/app/context/AuthContext.tsx`). Also, `supabase/migrations/20260615124800_huuqa_cms_public_policies.sql` explicitly grants anonymous INSERT/UPDATE on the public CMS key namespace and anonymous Storage upload permissions. If those policies are live, the administrative interface is **not** a reliable server-side authorization boundary, and data integrity / storage-abuse risk is high.

These issues **were not changed in this patch**, because tightening access safely requires real server-verified authentication, new RLS/Edge checks, and careful testing to avoid breaking CMS editing. Treat this as a high-priority separate project; rotate exposed credentials and review live RLS policies once a replacement auth scheme is ready. Never put service-role keys in browser source.

## Source references

- Supabase cache guidance: https://supabase.com/docs/guides/storage/cdn/smart-cdn
- Supabase upload API: https://supabase.com/docs/reference/javascript/file-buckets-upload
- Supabase update API: https://supabase.com/docs/reference/javascript/file-buckets-update
- Supabase usage: https://supabase.com/docs/guides/platform/manage-your-usage/egress
