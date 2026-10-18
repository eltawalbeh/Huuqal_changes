import { projectId, publicAnonKey } from '/utils/supabase/info'

const FUNCTION_SLUG = 'make-server-60022939'
export const EDGE_BASE = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_SLUG}`
export const REST_BASE = `https://${projectId}.supabase.co/rest/v1`
const AUTH_HEADERS = { Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'Content-Type': 'application/json' }

const TABLE = 'kv_store_0947ad50'
const TABLE_CANDIDATES = ['kv_store_0947ad50', 'kv_store_60022939']

export type CmsSection = 'settings' | 'content' | 'seo' | 'menu' | 'seed_version' | 'categories' | 'revision'
export type CmsHealth = {
  ok: boolean
  provider: 'Supabase Edge Function' | 'Supabase PostgREST'
  latency_ms: number
  checkedAt: Date
  error: string | null
  keepaliveUrl: string
  keepaliveHeaders: Record<string, string>
}

const keyFor = (section: CmsSection) => `cms:${section}`

export const EDGE_KEEPALIVE_URL = `${EDGE_BASE}/cms/settings`
export const REST_KEEPALIVE_URL = `${REST_BASE}/${TABLE}?select=key&key=eq.cms%3Asettings&limit=1`
export const KEEPALIVE_HEADERS = { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` }

let edgeAvailability: 'unknown' | 'available' | 'unavailable' = 'unknown'
const unsupportedEdgeSections = new Set<CmsSection>()
const pendingLoads = new Map<CmsSection, Promise<CmsLoadResult>>()
let quotaBlockedUntil = 0
const QUOTA_COOLDOWN_MS = 60_000

export type CmsLoadResult = { ok: boolean; value: any; status: number; error?: string }

class CmsRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'CmsRequestError'
  }
}

function quotaIsBlocked() { return Date.now() < quotaBlockedUntil }
function rememberQuotaStatus(status: number) {
  if (status === 402) quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS
}

async function edgeLoad(section: CmsSection): Promise<{ value: any; ok: boolean; status: number; text?: string }> {
  // The deployed project currently uses PostgREST. Remember a 404 for this
  // page session so every CMS read does not first pay for a failed Edge call.
  if (quotaIsBlocked()) return { value: null, ok: false, status: 402 }
  if (edgeAvailability === 'unavailable' || unsupportedEdgeSections.has(section)) return { value: null, ok: false, status: 404 }
  const res = await fetch(`${EDGE_BASE}/cms/${section}`, { headers: AUTH_HEADERS })
  rememberQuotaStatus(res.status)
  if (!res.ok) {
    if (res.status === 404) edgeAvailability = 'unavailable'
    if (res.status === 400) unsupportedEdgeSections.add(section)
    return { value: null, ok: false, status: res.status, text: await res.text().catch(() => '') }
  }
  edgeAvailability = 'available'
  const { value } = await res.json()
  return { value: value ?? null, ok: true, status: res.status }
}

async function restLoad(section: CmsSection): Promise<any> {
  if (quotaIsBlocked()) throw new CmsRequestError(402, 'Supabase quota exceeded; retry later')
  let lastError = ''
  let lastStatus = 0
  for (const table of TABLE_CANDIDATES) {
    const res = await fetch(`${REST_BASE}/${table}?select=value&key=eq.${encodeURIComponent(keyFor(section))}&limit=1`, { headers: AUTH_HEADERS })
    if (res.ok) {
      const rows = await res.json()
      return rows?.[0]?.value ?? null
    }
    lastStatus = res.status
    rememberQuotaStatus(res.status)
    lastError = `PostgREST load ${table} returned ${res.status}: ${await res.text().catch(() => '')}`
    if (res.status !== 404) break
  }
  throw new CmsRequestError(lastStatus, lastError)
}

// Collapse concurrent reads from focus/visibility events and components.
export function cmsLoadResult(section: CmsSection): Promise<CmsLoadResult> {
  const pending = pendingLoads.get(section)
  if (pending) return pending

  const task = (async (): Promise<CmsLoadResult> => {
    if (quotaIsBlocked()) return { ok: false, value: null, status: 402, error: 'Supabase quota exceeded; retry later' }
    try {
      const edge = await edgeLoad(section)
      if (edge.ok) return { ok: true, value: edge.value, status: edge.status }
      if (edge.status === 402) return { ok: false, value: null, status: 402, error: edge.text ?? 'Quota exceeded' }
    } catch (error) {
      // Edge may be unconfigured; a REST fallback is valid for network errors.
      console.warn('CMS Edge unavailable; trying PostgREST:', error)
    }

    try {
      return { ok: true, value: await restLoad(section), status: 200 }
    } catch (error: any) {
      return { ok: false, value: null, status: error?.status ?? 0, error: error?.message ?? String(error) }
    }
  })()

  pendingLoads.set(section, task)
  void task.finally(() => pendingLoads.delete(section)).catch(() => {})
  return task
}

// Legacy consumers still get a value; synchronization uses the status-aware
// version so a 402/network error can never be mistaken for absent CMS data.
export async function cmsLoad(section: CmsSection): Promise<any> {
  const result = await cmsLoadResult(section)
  if (!result.ok) console.warn('CMS read unavailable: ' + section + ' HTTP ' + result.status, result.error)
  return result.ok ? result.value : null
}

export async function uploadImage(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `menu/${Date.now()}_${crypto.randomUUID()}.${fileExt}`
  const buckets = ['make-a3f1a5bb-media', 'huuqa-media', 'menu-images', 'public']

  // Best path: Edge Function uses service role, creates the bucket if missing,
  // and uploads without exposing privileged keys in the browser.
  let edgeError: unknown = null
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const res = await fetch(`${EDGE_BASE}/upload`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ base64, filename: file.name, contentType: file.type }),
    })
    if (res.ok) {
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      return url
    }
    rememberQuotaStatus(res.status)
    if (res.status === 402) throw new Error('Supabase bandwidth quota exceeded (HTTP 402). Upload aborted.')
    edgeError = `${res.status}: ${await res.text().catch(() => '')}`
  } catch (e) {
    edgeError = e
  }

  // Fallback: direct Storage upload works only after the bucket and RLS upload
  // policy have been created in Supabase.
  if (quotaIsBlocked()) throw new Error('Supabase bandwidth quota exceeded (HTTP 402). Upload aborted.')
  let lastStorageError: unknown = null
  for (const bucket of buckets) {
    const upload = await fetch(`https://${projectId}.supabase.co/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'Content-Type': file.type || 'application/octet-stream', 'cache-control': '604800' },
      body: file,
    })
    if (upload.ok) return `https://${projectId}.supabase.co/storage/v1/object/public/${bucket}/${path}`
    rememberQuotaStatus(upload.status)
    lastStorageError = await upload.text().catch(() => `HTTP ${upload.status}`)
    if (upload.status === 402 || upload.status === 429) break
  }

  throw new Error(
    `Upload is not configured yet. The database is connected, but Supabase Storage has no public upload bucket/policy and the Edge Function upload endpoint is unavailable. Deploy the Edge Function or run the storage migration. Edge error: ${edgeError}; Storage error: ${lastStorageError}`,
  )
}

async function cmsSaveRaw(section: CmsSection, data: unknown): Promise<void> {
  let edgeError = ''

  // Skip the known-unavailable Edge route after its first 404 in this session.
  if (edgeAvailability !== 'unavailable') {
    try {
      const res = await fetch(`${EDGE_BASE}/cms/${section}`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify(data),
      })
      if (res.ok) {
        edgeAvailability = 'available'
        return
      }
      rememberQuotaStatus(res.status)
      if (res.status === 404) edgeAvailability = 'unavailable'
      edgeError = `${res.status}: ${await res.text().catch(() => '')}`
    } catch (e: any) {
      edgeError = e?.message ?? String(e)
    }
  }

  if (quotaIsBlocked()) throw new Error('Supabase quota exceeded (HTTP 402). Save aborted.')
  let firstBlockingError = ''
  let lastError = ''
  for (const table of TABLE_CANDIDATES) {
    const res = await fetch(`${REST_BASE}/${table}?on_conflict=key`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: keyFor(section), value: data }),
    })
    if (res.ok || res.status === 201) return
    rememberQuotaStatus(res.status)
    const message = `PostgREST ${table} returned ${res.status}: ${await res.text().catch(() => '')}`
    lastError = message
    if (res.status !== 404) {
      if (!firstBlockingError) firstBlockingError = message
      break
    }
  }

  const directError = firstBlockingError || lastError
  throw new Error(
    `Supabase is connected for reads, but writes are not configured yet. Edge Function write failed (${edgeError}). Direct database write failed (${directError}). Deploy the Edge Function from Make settings, or apply the included Supabase migration to enable CMS writes and Storage uploads.`,
  )
}

export async function cmsSave(section: CmsSection, data: unknown): Promise<void> {
  await cmsSaveRaw(section, data)
  // A tiny revision record lets public visitors detect dashboard changes without
  // downloading the complete menu/settings/content on a fixed polling loop.
  if (section !== 'revision') {
    await cmsSaveRaw('revision', { updatedAt: new Date().toISOString(), section })
  }
}

export async function checkCmsHealth(): Promise<CmsHealth> {
  const start = Date.now()
  try {
    const edge = await edgeLoad('settings')
    const latency_ms = Date.now() - start
    if (edge.ok) return { ok: true, provider: 'Supabase Edge Function', latency_ms, checkedAt: new Date(), error: null, keepaliveUrl: EDGE_KEEPALIVE_URL, keepaliveHeaders: { Authorization: `Bearer ${publicAnonKey}` } }
    if (edge.status !== 404) throw new Error(`Edge returned ${edge.status}: ${edge.text}`)
  } catch (e) {
    console.log('Edge health failed; trying direct PostgREST:', e)
  }

  const restStart = Date.now()
  try {
    await restLoad('settings')
    return {
      ok: true,
      provider: 'Supabase PostgREST',
      latency_ms: Date.now() - restStart,
      checkedAt: new Date(),
      error: null,
      keepaliveUrl: REST_KEEPALIVE_URL,
      keepaliveHeaders: KEEPALIVE_HEADERS,
    }
  } catch (e: any) {
    return { ok: false, provider: 'Supabase PostgREST', latency_ms: Date.now() - restStart, checkedAt: new Date(), error: e.message ?? String(e), keepaliveUrl: REST_KEEPALIVE_URL, keepaliveHeaders: KEEPALIVE_HEADERS }
  }
}
