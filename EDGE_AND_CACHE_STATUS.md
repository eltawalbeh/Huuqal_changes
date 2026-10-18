# HuuQa — Edge Functions deployment + legacy cache-policy status

Date: 18 October 2026. Source Supabase project: `onitstcxsivzpclvdkba` (HuuQa's Org).

## Edge Function — DONE (deployment), runtime regression PENDING

- **New function:** `make-server-60022939` — version **1**, status **ACTIVE**, `verify_jwt=true`.
- Function URL: `https://onitstcxsivzpclvdkba.supabase.co/functions/v1/make-server-60022939`.
- Production function deployment source: [`supabase/functions/make-server-60022939/index.ts`](supabase/functions/make-server-60022939/index.ts).
- This function is a JWT-verified, **RLS-respecting (anon-key)** CMS API, not a service-role bypass.
- Supports `GET /health`, `GET/POST /cms/{settings,content,seo,menu,seed_version,categories,revision}`, and `POST /upload`; existing URLs/code expect that exact function slug.
- New uploads use `cacheControl: '604800'` (seven days), original images untouched.
- The four previously deployed Edge Functions have **not been removed or overwritten**.
- Deployment was verified with the Supabase Management API; code re-read from deployed function. **End-to-end HTTP invocation has not yet been verified**, because the external HTTP probe was not accessible from the assistant's execution environment.
- Existing 402 quota restrictions are *not* resolved by deploying a function. Expect API requests to fail until quotas renew or plan/capacity changes.

### Security warning — separate migration needed

The existing live RLS policies grant `anon` INSERT/UPDATE/DELETE access to CMS keys in `kv_store_0947ad50` and anonymous uploads to the menu Storage bucket; existing frontend admin auth is local-only. The new function deliberately **does not use service_role** for these actions and does not increase database privilege. Nevertheless, it does **not secure administrator writes**; implement Supabase Auth or another server-verified identity, then restrict RLS and routes before claiming a secure admin CMS. The `verify_jwt` setting alone is not proof of admin identity: a public anon JWT satisfies legacy JWT verification.

## Legacy Storage cache-policy — PREPARED ONLY, NOT APPLIED

Live Storage inventory inspected read-only:
- Bucket: `make-a3f1a5bb-media`
- 53 files, all inside `menu/`
- JPEG: 40 files / 57,043,964 bytes
- PNG: 13 files / 27,881,395 bytes
- Total: 84,925,359 bytes (~81 MiB)
- All 53 files have `metadata.cacheControl = 'no-cache'`.

To update the **existing** objects using the supported Supabase Storage API, the same content must be backed up and uploaded back using `storage.update(..., { cacheControl: '604800' })`. Editing `storage.objects.metadata` directly with SQL is **not** a supported replacement for this operation. This can trigger egress and must not run while the Free-plan restrictions are in force.

A conservative maintenance script is staged at [`scripts/cache-policy-existing-media.mjs`](scripts/cache-policy-existing-media.mjs):
- Dry-run by default, no mutations.
- Explicit `--apply --confirm-count 53 --backup-dir /absolute/private/path` required for mutation.
- Checks correct project and expected file count.
- Downloads full original contents and saves hashes/backups for **all affected files first**.
- Uses supported Storage API `update()` on the **same original paths** (no renaming or compression).
- Stops immediately on an error; it never deletes or auto-rolls back an object.
- Rechecks metadata at end.

Script requires `@supabase/supabase-js` installed in a trusted Node environment and **SUPABASE_URL**, **SUPABASE_SERVICE_ROLE_KEY** supplied privately via environment variables. Never commit these credentials or backups to GitHub; do not run the script in a browser or Figma Make. A service key is a high-privilege secret.

**Current status:** No legacy assets have been downloaded, replaced, updated, or deleted. The migration must wait for successful download access, backups, and a controlled execution window.

## After quota restoration

1. Verify `GET /health` and `GET /cms/revision` using the site's JWT credentials; expect JWT-required behavior. Check browser preflight OPTIONS and CMS results.
2. Confirm CMS writes and image uploads work (and keep values stable) from the existing admin UI. Verify the 402 rate declines.
3. Run the cache script in dry-run mode, verify 53-object inventory and quotas, then execute with protected backups and review its results.
4. Recheck Storage metadata, browser Response Headers and Supabase Usage metrics.
5. Address public CMS write permissions and frontend-admin authentication in a separate secured rollout.
