import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router'
import { NeonAdminGate } from '../../components/NeonAdminGate'
import { neonAdminClient } from '../../utils/neonCms'
import { LayoutDashboard, UtensilsCrossed, Settings, Users, LogOut, ExternalLink, Search, FileText, Layers, Megaphone } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { DatabaseStatusDot } from '../../components/DatabaseStatus'
import logoImg from '../../../imports/Asset_1_1.png'

const C = { charcoal: '#161212', espresso: '#2A1D18', bronze: '#AB7354', sand: '#BA9B7E', ivory: '#FAE1C0', taupe: '#544841', surface: '#1A1210' }

const NAV = [
  { to: '/admin/overview', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/menu', icon: UtensilsCrossed, label: 'Menu Manager' },
  { to: '/admin/categories', icon: Layers, label: 'Categories' },
  { to: '/admin/content', icon: FileText, label: 'Page Content' },
  { to: '/admin/promotion', icon: Megaphone, label: 'Promotion Popup' },
  { to: '/admin/seo', icon: Search, label: 'SEO & Tracking' },
  { to: '/admin/settings', icon: Settings, label: 'Site Settings' },
  { to: '/admin/users', icon: Users, label: 'Users' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) navigate('/admin/login', { replace: true })
  }, [user])

  if (!user) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.surface, color: C.ivory, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

      {/* Sidebar */}
      <aside style={{ width: '224px', background: C.espresso, borderRight: `1px solid rgba(250,225,192,0.1)`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '22px 20px 18px' }}>
          <img src={logoImg} alt="HuuQa" style={{ height: '40px', objectFit: 'contain', display: 'block', marginBottom: '6px' }} />
          <p style={{ fontSize: '9px', letterSpacing: '0.22em', color: C.bronze, fontFamily: 'Inter, sans-serif' }}>ADMIN PANEL</p>
        </div>

        <nav style={{ padding: '4px 10px', flex: 1 }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px',
              background: isActive ? 'rgba(171,115,84,0.18)' : 'transparent',
              color: isActive ? C.bronze : C.sand,
              textDecoration: 'none', fontSize: '13px', marginBottom: '2px',
              transition: 'all 0.15s', letterSpacing: '0.02em',
            })}>
              {({ isActive }) => (
                <>
                  <Icon size={15} style={{ flexShrink: 0 }} />
                  {label}
                  {isActive && <div style={{ marginLeft: 'auto', width: '5px', height: '5px', borderRadius: '50%', background: C.bronze }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: `1px solid rgba(250,225,192,0.1)`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <DatabaseStatusDot />
          <a href="/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', color: C.sand, textDecoration: 'none', fontSize: '13px' }}>
            <ExternalLink size={14} /> View Site
          </a>
          <button onClick={() => { void neonAdminClient.auth.signOut().catch(() => {}); logout(); navigate('/admin/login') }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: 'none', border: 'none', color: C.sand, cursor: 'pointer', fontSize: '13px', width: '100%', textAlign: 'left' }}>
            <LogOut size={14} /> Sign Out
          </button>
          <div style={{ padding: '10px 12px', borderTop: `1px solid rgba(250,225,192,0.08)`, marginTop: '4px' }}>
            <p style={{ fontSize: '12px', color: C.ivory, fontWeight: 500, marginBottom: '2px' }}>{user.name}</p>
            <p style={{ fontSize: '11px', color: C.taupe }}>{user.role === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${C.taupe} transparent` }}>
        <NeonAdminGate><Outlet /></NeonAdminGate>
      </div>
    </div>
  )
}
