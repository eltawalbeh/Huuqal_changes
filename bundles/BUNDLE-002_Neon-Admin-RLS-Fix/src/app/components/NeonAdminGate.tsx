import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { neonAdminClient } from '../utils/neonCms'

const C = { bg: '#161212', panel: '#2A1D18', gold: '#AB7354', pale: '#FAE1C0', muted: '#BA9B7E' }

// Secondary, server-verified identity. The legacy CMS login is NOT enough to
// write to Neon. The RLS admin allowlist remains the authority for publishing.
export function NeonAdminGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    neonAdminClient.auth.getSession()
      .then(async (result: any) => {
        if (!active) return
        if (!result.data?.session || !result.data?.user?.id) {
          setSignedIn(false)
          return
        }
        const { data: access, error: accessError } = await neonAdminClient.rpc('cms_publish_access')
        if (accessError || access?.approved !== true) {
          setMessage('Your Neon session is present but publishing permission is not confirmed. Please sign out and sign in again.')
          setSignedIn(false)
        } else {
          setSignedIn(true)
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signup') {
        const result: any = await neonAdminClient.auth.signUp.email({
          email: email.trim(), password, name: email.trim().split('@')[0],
        })
        if (result.error) throw new Error(result.error.message || 'Sign up failed')
        setMessage('Account created. Verify your email if prompted, then sign in. Contact the site owner to approve CMS publishing access.')
        setMode('signin')
      } else {
        const result: any = await neonAdminClient.auth.signIn.email({ email: email.trim(), password })
        if (result.error) throw new Error(result.error.message || 'Sign in failed')
        const session: any = await neonAdminClient.auth.getSession()
        if (!session.data?.user?.id) throw new Error('Could not verify Neon session')
        const { data: access, error: accessError } = await neonAdminClient.rpc('cms_publish_access')
        if (accessError || access?.approved !== true) {
          throw new Error('Account signed in, but the CMS publishing permission check failed. Retry signing in. ' + (accessError?.message ?? 'RLS did not recognize your account'))
        }
        setSignedIn(true)
      }
    } catch (error: any) {
      setMessage(error?.message ?? String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <div style={{ padding: '48px', color: C.pale }}>Checking secure CMS session…</div>
  if (signedIn) return <>{children}</>

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <form onSubmit={submit} style={{ background: C.panel, width: '100%', maxWidth: '420px', padding: '28px', borderRadius: '12px', border: '1px solid rgba(250,225,192,.15)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2 style={{ fontSize: '21px', margin: 0 }}>Secure CMS Publishing</h2>
        <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.6, margin: 0 }}>
          HuuQa now uses Neon for content. Sign in to your approved CMS account.
          The previous local-only login does not grant database write access.
        </p>
        <label style={{ fontSize: '12px' }}>Email
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '12px', marginTop: '5px', borderRadius: '8px', background: C.bg, color: C.pale, border: '1px solid #544841' }} />
        </label>
        <label style={{ fontSize: '12px' }}>Password
          <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '12px', marginTop: '5px', borderRadius: '8px', background: C.bg, color: C.pale, border: '1px solid #544841' }} />
        </label>
        {message && <p role="status" style={{ color: C.muted, fontSize: '12px', margin: 0 }}>{message}</p>}
        <button disabled={busy} type="submit" style={{ padding: '12px', background: C.gold, color: C.bg, border: 0, borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in to Neon CMS' : 'Create Neon CMS account'}
        </button>
        <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }} style={{ padding: '8px', border: 0, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
          {mode === 'signin' ? 'First time? Create a secure CMS account' : 'Already have an account? Sign in'}
        </button>
        <p style={{ fontSize: '11px', lineHeight: 1.6, color: C.muted }}>
          New accounts need administrator approval before they can save menu changes.
          Do not share passwords with anyone.
        </p>
      </form>
    </div>
  )
}
