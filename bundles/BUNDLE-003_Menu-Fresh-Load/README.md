# BUNDLE-003 — Menu Fresh Load (no stale-price flash)

**HuuQa Lusail — 19 October 2026**  
**Status:** Code staged in GitHub; NOT published to Figma Make yet.

## What this fixes

On an Incognito/private visit to `/menu`, the bundled backup still shows the old price for **Spaghetti Bolognese (6.25 JOD)** before Neon delivers the saved **7 JOD** price. That split-second flash misleads visitors even though CMS saves are functioning.

This bundle ensures that **menu cards and prices stay behind a localized loading state until Neon confirms current data**. It does not hard-code the 7 JOD price: future edits are loaded dynamically.

For existing browsers with a cached menu, the page first checks the small `cms:revision` record. If the cache revision matches Neon, it displays the confirmed cached menu; otherwise it loads the full menu from Neon before showing the cards. For a new private browser, there is no cached menu so it fetches the menu directly.

If the API fails or is slow for 12 seconds, it uses the existing emergency fallback but **clearly warns that backup prices and availability may be outdated**. If the live response arrives later, it replaces the fallback.

## Transfer manifest — only ONE changed file

| # | Source file in this bundle | Destination path in Figma Make | Action |
|---|---|---|---|
| 1 | [`src/app/pages/MenuPage.tsx`](src/app/pages/MenuPage.tsx) | `src/app/pages/MenuPage.tsx` | **REPLACE** |

**Transfer only the file inside this bundle to the same path in Figma Make.** Do not create a `bundles/` directory inside Figma Make. BUNDLE-001 and BUNDLE-002 must remain applied; do not recopy them.

## Expected visitor behavior after publishing

1. Open `https://huqaalusail.com/menu?item=m067` in a new Private/Incognito window.
2. Initially see **“جاري تحميل القائمة والأسعار الحالية…”** while Neon confirms prices.
3. See **7 JOD directly** for Spaghetti Bolognese after loading; **6.25 must not flash**.
4. Reopen in a browser that has cached CMS data: it should wait for a quick revision check; then display verified cached data, or refetch if changed.
5. If Neon is unreachable, the backup menu may appear after 12 seconds with an explicit, prominent pricing-accuracy warning in Arabic/Turkish/English.
6. Verify the other menu layouts (chapters/classic/spotlight) still work.

## Scope

- **No changes** to Admin, Neon database, permissions, images, Supabase, global route structure, or dependencies.
- The bundle modifies one visitor-side component only.
- Refreshing `cms:revision` for returning menu visitors adds a small read per visit, but full menu data only loads when revision differs or a valid local cache is missing.
- A broken/unreachable server cannot guarantee live pricing; the visitor gets a clear backup warning rather than an unmarked wrong price.
- The live website and GitHub original repository are not automatically changed by this staging commit.
