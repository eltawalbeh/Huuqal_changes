// Public visitors keep a local CMS cache. They only request the small revision
// record periodically; full CMS documents are downloaded only on first visit,
// after a deployment cache reset, or when an admin has published a change.
export const PUBLIC_REVISION_CHECK_MS = 15 * 60 * 1000

export function hasCachedCmsData(storage) {
  return ['hq_menu', 'hq_categories', 'hq_settings', 'hq_content', 'hq_seo'].every(key => Boolean(storage.getItem(key)))
}

export function shouldCheckRevision(meta, now) {
  return !meta || now - (meta.lastRevisionCheck || 0) >= PUBLIC_REVISION_CHECK_MS
}

export function shouldLoadFullCms({ isAdmin, forceFull, cached, localRevision, serverRevision }) {
  if (isAdmin || forceFull || !cached) return true
  return Boolean(serverRevision) && serverRevision !== localRevision
}
