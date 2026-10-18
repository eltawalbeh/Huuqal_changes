import { useState, useEffect } from 'react'
import { cmsLoadResult } from '../utils/cms'
import { X } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { tagConfig } from '../data/menuData'
import { useLiveSettings, useLiveMenu, useLiveCategories } from '../hooks/useLiveData'
import { useSEO } from '../hooks/useSEO'
import { trackMenuView, trackItemView } from '../utils/tracking'
import { webpImageUrl } from '../utils/imageDelivery'
import { MenuViewChapters } from '../components/menu/MenuViewChapters'
import { MenuViewSpotlight } from '../components/menu/MenuViewSpotlight'
import { MenuViewClassic } from '../components/menu/MenuViewClassic'

const C = { charcoal: '#161212', espresso: '#2A1D18', bronze: '#AB7354', sand: '#BA9B7E', ivory: '#FAE1C0', taupe: '#544841' }

export default function MenuPage() {
  const { t, lang, isRtl } = useLang()
  const settings = useLiveSettings()
  const allItems = useLiveMenu()
  // Prevent stale bundled prices (e.g. 6.25 -> 7) from flashing before
  // the live CMS has confirmed the current revision for this browser visit.
  const [menuFreshness, setMenuFreshness] = useState<'loading' | 'verified' | 'offline'>('loading')

  useEffect(() => {
    let mounted = true
    // In a prolonged outage, keep the emergency fallback available but clearly
    // label it as potentially outdated. Never silently show old prices as live.
    const timeout = window.setTimeout(() => {
      if (mounted) setMenuFreshness('offline')
    }, 12000)

    const isValidMenu = (value: unknown): value is any[] =>
      Array.isArray(value) && value.length > 0 && value.every((item: any) =>
        item && typeof item.id === 'string' && typeof item.price === 'number' &&
        typeof item.available === 'boolean')

    const revisionId = (value: any): string | null => {
      if (!value) return null
      if (typeof value === 'string') return value
      return typeof value.updatedAt === 'string' ? value.updatedAt : JSON.stringify(value)
    }

    const checkFreshMenu = async () => {
      // Returning visitors can reuse an existing menu ONLY after Neon confirms
      // its revision matches the successfully synced local copy.
      let cached: unknown = null
      let localRevision: string | null = null
      try {
        cached = JSON.parse(localStorage.getItem('hq_menu') || 'null')
        localRevision = JSON.parse(localStorage.getItem('hq_cms_cache_meta') || 'null')?.revision ?? null
      } catch { /* Corrupted cache; fetch the authoritative menu instead. */ }

      if (isValidMenu(cached) && localRevision) {
        const revision = await cmsLoadResult('revision')
        if (!mounted) return
        if (revision.ok && revisionId(revision.value) === localRevision) {
          setMenuFreshness('verified')
          return
        }
      }

      // First-time/private visitors, or a changed revision: load current
      // values before rendering any product card or price.
      const result = await cmsLoadResult('menu')
      if (!mounted) return
      if (!result.ok || !isValidMenu(result.value)) {
        setMenuFreshness('offline')
        return
      }

      try {
        const serialized = JSON.stringify(result.value)
        if (localStorage.getItem('hq_menu') !== serialized) {
          localStorage.setItem('hq_menu', serialized)
          window.dispatchEvent(new CustomEvent('hq:menu'))
        }
      } catch (error) {
        console.warn('Unable to cache live menu locally:', error)
        setMenuFreshness('offline')
        return
      }
      setMenuFreshness('verified')
    }

    void checkFreshMenu().catch(error => {
      console.warn('Menu freshness check failed:', error)
      if (mounted) setMenuFreshness('offline')
    }).finally(() => window.clearTimeout(timeout))

    return () => {
      mounted = false
      window.clearTimeout(timeout)
    }
  }, [])
  const liveCategories = useLiveCategories()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rawView = (settings as any).menu_view ?? 'spotlight'
  const menuView = rawView === 'stage' ? 'spotlight' : rawView

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'HuuQa Menu',
    numberOfItems: menuFreshness === 'verified' ? allItems.length : 0,
    itemListElement: (menuFreshness === 'verified' ? allItems : []).slice(0, 20).map((item: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: { '@type': 'MenuItem', name: item.name, description: item.description, offers: { '@type': 'Offer', price: String(item.price), priceCurrency: 'JOD' } },
    })),
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Menu', item: '/menu' },
    ],
  }

  useSEO({ title: 'Menu', canonical: '/menu', schema: [itemListSchema, breadcrumbSchema] })
  useEffect(() => { trackMenuView() }, [])
  useEffect(() => {
    const itemId = new URLSearchParams(window.location.search).get('item')
    if (itemId && allItems.some((item: any) => item.id === itemId)) setSelectedId(itemId)
  }, [allItems])

  const name = (item: any) => lang === 'ar' ? (item.nameAr || item.name) : lang === 'tr' ? (item.nameTr || item.name) : item.name
  const desc = (item: any) => lang === 'ar' ? (item.descriptionAr || item.description) : lang === 'tr' ? (item.descriptionTr || item.description) : item.description
  const catName = (cat: any) => lang === 'ar' ? (cat.nameAr || cat.name) : lang === 'tr' ? (cat.nameTr || cat.name) : cat.name

  // Shisha flavors (price = 0, subcategory = 'flavor') are presented inside each
  // style's modal — they are not shown as standalone cards in any menu view.
  const shishaFlavors = allItems.filter((i: any) => i.category === 'shisha' && i.subcategory === 'flavor')
  const displayItems  = allItems.filter((i: any) => i.available !== false && !(i.category === 'shisha' && i.subcategory === 'flavor'))

  const selected = menuFreshness !== 'loading' ? allItems.find((i: any) => i.id === selectedId) : null
  const isShishaStyle = selected?.category === 'shisha' && selected?.subcategory === 'huqaa'

  const handleSelect = (id: string) => {
    const item = allItems.find((i: any) => i.id === id)
    if (item) trackItemView({ name: item.name, category: item.category, price: item.price })
    setSelectedId(id)
  }

  const viewProps = { items: displayItems, categories: liveCategories, lang, isRtl, t, onSelect: handleSelect }

  return (
    <div className="hq-page" style={{ background: C.charcoal, color: C.ivory, minHeight: '100vh' }}>

      {/* Page header */}
      <div style={{ background: `linear-gradient(to bottom, ${C.espresso}, ${C.charcoal})`, padding: `clamp(40px,6vh,72px) clamp(24px,6vw,80px) clamp(28px,4vh,48px)` }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', letterSpacing: '0.25em', color: C.bronze, marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>HUUQA IRBID</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(36px,6vw,60px)', fontWeight: 300, color: C.ivory, lineHeight: 1.05, marginBottom: '4px' }}>
            {t('menu.title')}
          </h1>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(16px,2.5vw,26px)', fontWeight: 300, color: C.sand, fontStyle: lang === 'ar' ? 'normal' : 'italic' }}>
            {t('menu.subtitle')}
          </p>
        </div>
      </div>

      {/* Keep the header visible, but do not expose out-of-date prices before
          Neon confirms the menu for this page visit. */}
      {menuFreshness === 'loading' ? (
        <div role="status" aria-live="polite" style={{
          minHeight: '38vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', color: C.sand, fontFamily: 'Inter, sans-serif',
          fontSize: '14px', letterSpacing: '0.03em',
        }}>
          {lang === 'ar' ? 'جاري تحميل القائمة والأسعار الحالية…' :
            lang === 'tr' ? 'Güncel menü ve fiyatlar yükleniyor…' :
            'Loading the latest menu and prices…'}
        </div>
      ) : (
        <>
          {menuFreshness === 'offline' && (
            <div role="status" style={{
              padding: '12px 24px', background: 'rgba(171,115,84,0.12)',
              color: C.ivory, textAlign: 'center', fontSize: '13px', lineHeight: 1.6,
              borderBottom: '1px solid rgba(171,115,84,0.25)',
            }}>
              {lang === 'ar' ? 'تعذر تحديث القائمة الآن. المعروض نسخة احتياطية وقد تختلف الأسعار والتوفر؛ يرجى التأكد قبل الطلب.' :
                lang === 'tr' ? 'Güncel menüye ulaşılamıyor. Gösterilen yedek listedeki fiyatlar ve stok durumu farklı olabilir.' :
                'The live menu is unavailable. This is a backup; prices and availability may differ.'}
            </div>
          )}
          {menuView === 'chapters'  && <MenuViewChapters  {...viewProps} />}
          {menuView === 'spotlight' && <MenuViewSpotlight {...viewProps} />}
          {menuView === 'classic'   && <MenuViewClassic   {...viewProps} />}
        </>
      )}

      {/* Item detail modal — shared across all views */}
      {selected && (
        <div onClick={() => setSelectedId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,18,18,0.88)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{
              background: C.espresso,
              borderRadius: '20px',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '540px',
              border: `1px solid rgba(250,225,192,0.12)`,
              boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
              maxHeight: '90dvh',
              display: 'flex',
              flexDirection: 'column',
            }}>

            {/* Image */}
            <div style={{ height: 'clamp(180px,40vw,260px)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
              {selected.image && <img src={webpImageUrl(selected.image)} alt={name(selected)} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(42,29,24,0.9) 100%)' }} />
              <button onClick={() => setSelectedId(null)}
                style={{ position: 'absolute', top: '12px', right: isRtl ? 'auto' : '12px', left: isRtl ? '12px' : 'auto', background: 'rgba(22,18,18,0.7)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: C.ivory, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            {/* Content — scrollable if content overflows */}
            <div style={{ overflowY: 'auto', padding: 'clamp(16px,3vw,24px) clamp(16px,4vw,28px) clamp(20px,4vw,28px)', scrollbarWidth: 'none' }}>
              <p style={{ fontSize: '10px', letterSpacing: '0.18em', color: C.bronze, marginBottom: '6px', fontFamily: 'Inter, sans-serif' }}>
                {catName(liveCategories.find(c => c.id === selected.category) ?? { name: selected.category, nameAr: selected.category, nameTr: selected.category }).toUpperCase()}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(22px,5vw,28px)', fontWeight: 400, color: C.ivory, lineHeight: 1.15 }}>{name(selected)}</h2>
                <p style={{ fontSize: 'clamp(18px,4vw,24px)', color: C.bronze, fontWeight: 600, flexShrink: 0 }}>JOD {selected.price}</p>
              </div>
              <p style={{ fontSize: '14px', color: C.sand, lineHeight: 1.75, marginBottom: '14px' }}>{desc(selected)}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: isShishaStyle ? '20px' : '18px' }}>
                {selected.tags.map((tag: string) => {
                  const tc = tagConfig[tag]
                  return <span key={tag} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', background: tc?.bg, color: tc?.color, border: `1px solid ${tc?.border}` }}>{t(`tags.${tag}`)}</span>
                })}
              </div>

              {/* Flavor selector — shown only for shisha styles */}
              {isShishaStyle && shishaFlavors.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '10px', letterSpacing: '0.18em', color: C.bronze, marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                    {lang === 'ar' ? 'اختر النكهة' : lang === 'tr' ? 'AROMA SEÇİN' : 'CHOOSE YOUR FLAVOR'}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {shishaFlavors.map((flavor: any) => (
                      <span key={flavor.id} style={{
                        fontSize: '12px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: `1px solid rgba(171,115,84,0.35)`,
                        background: 'rgba(171,115,84,0.08)',
                        color: C.sand,
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'default',
                      }}>
                        {name(flavor)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setSelectedId(null)}
                style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid rgba(250,225,192,0.2)`, borderRadius: '10px', cursor: 'pointer', color: C.sand, fontSize: '14px', minHeight: '48px' }}>
                {t('menu.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
