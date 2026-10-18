import { useState, useEffect } from 'react'
import { loadSettings, SiteSettings } from '../data/siteSettings'
import { loadContent, ContentSettings } from '../data/contentData'
import { loadSEO, SEOSettings } from '../data/seoData'
import { menuItems, MenuItem } from '../data/menuData'
import { loadCategories, Category } from '../data/categoryData'

function useLive<T>(loader: () => T, event: string): T {
  const [data, setData] = useState<T>(loader)
  useEffect(() => {
    const refresh = () => setData(loader())
    window.addEventListener(event, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(event, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return data
}

function normalizeItem(stored: any): any {
  // The old CSV importer lowercased all headers, so camelCase fields were stored
  // as e.g. "namear" instead of "nameAr". Fix that for every item regardless of origin.
  const nameAr        = stored.nameAr        || stored.namear        || ''
  const nameTr        = stored.nameTr        || stored.nametr        || ''
  const descriptionAr = stored.descriptionAr || stored.descriptionar || ''
  const descriptionTr = stored.descriptionTr || stored.descriptiontr || ''

  // Also try to recover from default items when fields are still empty
  return { ...stored, nameAr, nameTr, descriptionAr, descriptionTr }
}

const MENU_LS_KEY = 'hq_menu'

function loadMenu(): MenuItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MENU_LS_KEY) || 'null')
    // Emergency availability: serve the bundled 239-item menu when the CMS
    // cannot be reached (for example, an HTTP 402 quota restriction).
    // A valid locally cached or freshly synchronized CMS menu still wins.
    // Images in this bundled menu primarily use external Cloudways URLs.
    if (!Array.isArray(raw) || raw.length === 0) return menuItems
    const defaultMap = new Map(menuItems.map(i => [i.id, i]))
    return raw.map((stored: any) => {
      const item = normalizeItem(stored)
      const def  = defaultMap.get(item.id)
      if (!def) return item
      return {
        ...item,
        nameAr:        item.nameAr        || def.nameAr,
        nameTr:        item.nameTr        || def.nameTr,
        descriptionAr: item.descriptionAr || def.descriptionAr,
        descriptionTr: item.descriptionTr || def.descriptionTr,
      }
    })
  } catch { return menuItems }
}

export const useLiveSettings = (): SiteSettings => useLive(loadSettings, 'hq:settings')
export const useLiveContent = (): ContentSettings => useLive(loadContent, 'hq:content')
export const useLiveSEO = (): SEOSettings => useLive(loadSEO, 'hq:seo')
export const useLiveMenu = (): MenuItem[] => useLive(loadMenu, 'hq:menu')
export const useLiveCategories = (): Category[] => useLive(loadCategories, 'hq:categories')
