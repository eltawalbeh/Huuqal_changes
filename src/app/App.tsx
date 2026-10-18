import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { router } from './routes'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import { cmsLoadResult } from './utils/cms'
import { hasCachedCmsData, shouldCheckRevision, shouldLoadFullCms } from './utils/cmsSyncPolicy.js'
import { defaultSettings } from './data/siteSettings'
import { defaultContent } from './data/contentData'
import { defaultCategories } from './data/categoryData'
import { defaultSEO } from './data/seoData'
import { menuItems as defaultMenuItems } from './data/menuData'

function applyToLS(key: string, data: object, event: string) {
  const serialized = JSON.stringify(data)
  if (localStorage.getItem(key) === serialized) return
  localStorage.setItem(key, serialized)
  window.dispatchEvent(new CustomEvent(event))
}

// Bump this value when code-shipped CMS defaults change. This clears local CMS
// caches once after deploy, not on every visit.
const DATA_VERSION = 10
const CACHE_META_KEY = 'hq_cms_cache_meta'

type CacheMeta = {
  revision: string | null
  lastFullSync: number
  lastRevisionCheck: number
}

function readCacheMeta(): CacheMeta | null {
  try {
    const raw = localStorage.getItem(CACHE_META_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCacheMeta(meta: CacheMeta) {
  localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta))
}

function revisionToken(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return typeof value.updatedAt === 'string' ? value.updatedAt : JSON.stringify(value)
}

function checkDataVersion() {
  const stored = localStorage.getItem('hq_data_v')
  if (stored !== String(DATA_VERSION)) {
    ;['hq_menu', 'hq_categories', 'hq_settings', 'hq_content', 'hq_seo', CACHE_META_KEY].forEach(key => localStorage.removeItem(key))
    localStorage.setItem('hq_data_v', String(DATA_VERSION))
  }
}

function menuIsStale(data: any): boolean {
  if (!Array.isArray(data) || data.length === 0) return true
  return data.some((item: any) =>
    !item ||
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.category !== 'string' ||
    typeof item.price !== 'number' ||
    typeof item.available !== 'boolean',
  )
}

function ensureLocalCategories() {
  if (!localStorage.getItem('hq_categories')) {
    applyToLS('hq_categories', defaultCategories, 'hq:categories')
  }
}

async function loadFullCmsData(now: number, revision: string | null): Promise<boolean> {
  const [settings, content, seo, menu, categories] = await Promise.all([
    cmsLoadResult('settings'),
    cmsLoadResult('content'),
    cmsLoadResult('seo'),
    cmsLoadResult('menu'),
    cmsLoadResult('categories'),
  ])

  // A failed HTTP 402, network error, or broken policy must not wipe last-known
  // values or silently replace published content with defaults.
  if (settings.ok) applyToLS('hq_settings', settings.value || defaultSettings, 'hq:settings')
  if (content.ok) applyToLS('hq_content', content.value || defaultContent, 'hq:content')
  if (seo.ok) applyToLS('hq_seo', seo.value || defaultSEO, 'hq:seo')
  if (categories.ok) {
    applyToLS('hq_categories',
      Array.isArray(categories.value) && categories.value.length ? categories.value : defaultCategories,
      'hq:categories')
  }

  if (menu.ok) {
    if (menuIsStale(menu.value)) {
      // Never seed/write Supabase from a public visitor. Use local defaults
      // only if the server confirmed a missing or invalid menu.
      if (!localStorage.getItem('hq_menu')) {
        applyToLS('hq_menu', defaultMenuItems, 'hq:menu')
      }
    } else {
      applyToLS('hq_menu', menu.value, 'hq:menu')
    }
  }

  const complete = [settings, content, seo, menu, categories].every(result => result.ok)
  const previous = readCacheMeta()
  saveCacheMeta({
    revision: complete ? revision : previous?.revision ?? null,
    lastFullSync: complete ? now : previous?.lastFullSync ?? 0,
    lastRevisionCheck: now,
  })
  return complete
}

// Reuse a single synchronisation for concurrent focus + visibility events.
// Admin needs fresher reads than public visitors, but should not refetch the
// entire CMS on every tab focus or rapid navigation.
const ADMIN_SYNC_INTERVAL_MS = 60_000
let lastAdminSyncAt = 0
let currentSync: Promise<void> | null = null

async function performSync(forceFull: boolean) {
  ensureLocalCategories()
  const now = Date.now()
  const isAdmin = window.location.pathname.startsWith('/admin')
  const meta = readCacheMeta()
  const cached = hasCachedCmsData(localStorage)

  if (isAdmin && !forceFull && cached && now - lastAdminSyncAt < ADMIN_SYNC_INTERVAL_MS) return
  if (!isAdmin && !forceFull && cached && !shouldCheckRevision(meta, now)) return

  const revisionResult = await cmsLoadResult('revision')
  // Never treat a failed revision check as an empty revision, or cache it as
  // a successful check. The CMS quota guard handles repeated HTTP 402 calls.
  if (!revisionResult.ok) return

  const revision = revisionToken(revisionResult.value)
  if (!shouldLoadFullCms({
    isAdmin,
    forceFull,
    cached,
    localRevision: meta?.revision ?? null,
    serverRevision: revision,
  })) {
    saveCacheMeta({
      revision: meta?.revision ?? null,
      lastFullSync: meta?.lastFullSync ?? 0,
      lastRevisionCheck: now,
    })
    return
  }

  const success = await loadFullCmsData(now, revision)
  if (success && isAdmin) lastAdminSyncAt = now
}

function syncFromServer(forceFull = false): Promise<void> {
  if (currentSync) return currentSync
  currentSync = performSync(forceFull).finally(() => { currentSync = null })
  return currentSync
}

// Inject preconnect hints as early as possible
;[
  { href: 'https://fonts.googleapis.com' },
  { href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
].forEach(({ href, crossOrigin }: { href: string; crossOrigin?: string }) => {
  if (document.head.querySelector(`link[href="${href}"]`)) return
  const link = Object.assign(document.createElement('link'), { rel: 'preconnect', href })
  if (crossOrigin) link.crossOrigin = crossOrigin
  document.head.prepend(link)
})

export default function App() {
  useEffect(() => {
    checkDataVersion()
    void syncFromServer().catch(error => console.warn('CMS sync failed:', error))

    // A public tab refreshes only if its 15-minute revision check is due. This
    // keeps dashboard edits available without repeatedly downloading the menu.
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void syncFromServer().catch(error => console.warn('CMS sync failed:', error))
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [])

  return (
    <LanguageProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LanguageProvider>
  )
}
