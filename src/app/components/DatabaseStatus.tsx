import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Database, CheckCircle, XCircle, Clock, Copy, Check, ExternalLink } from 'lucide-react'
import { checkCmsHealth, REST_KEEPALIVE_URL, KEEPALIVE_HEADERS } from '../utils/cms'

export const KEEPALIVE_URL = REST_KEEPALIVE_URL
const AUTH_HEADER = `Bearer ${KEEPALIVE_HEADERS.Authorization.replace('Bearer ', '')}`

type Status = 'checking' | 'ok' | 'error'

interface HealthResult {
  status: Status
  latency_ms: number | null
  checkedAt: Date | null
  error: string | null
  provider?: string
  keepaliveUrl?: string
  keepaliveHeaders?: Record<string, string>
}

const EMPTY: HealthResult = { status: 'checking', latency_ms: null, checkedAt: null, error: null }

// Checks health by doing a real Supabase round-trip. It prefers the Edge Function
// when deployed and falls back to direct PostgREST so the dashboard still proves
// the database/table/policies are working when the function slug is unavailable.
async function checkHealth(): Promise<HealthResult> {
  const h = await checkCmsHealth()
  return {
    status: h.ok ? 'ok' : 'error',
    latency_ms: h.latency_ms,
    checkedAt: h.checkedAt,
    error: h.error,
    provider: h.provider,
    keepaliveUrl: h.keepaliveUrl,
    keepaliveHeaders: h.keepaliveHeaders,
  }
}

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#4ade80' : '#544841', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: '4px', flexShrink: 0 }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

const C = { espresso: '#2A1D18', bronze: '#AB7354', sand: '#BA9B7E', ivory: '#FAE1C0', taupe: '#544841', charcoal: '#161212' }

// ── Compact dot for the sidebar ──────────────────────────────────────────────
export function DatabaseStatusDot() {
  const [health, setHealth] = useState<HealthResult>(EMPTY)

  const refresh = useCallback(async () => {
    setHealth(h => ({ ...h, status: 'checking' }))
    setHealth(await checkHealth())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(id)
  }, [refresh])

  const color = health.status === 'ok' ? '#4ade80' : health.status === 'error' ? '#e07b70' : C.taupe
  const label = health.status === 'ok' ? 'Connected' : health.status === 'error' ? 'DB Error' : 'Checking…'

  return (
    <button
      onClick={refresh}
      title={health.error ?? `DB latency: ${health.latency_ms ?? '—'}ms`}
      style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', width: '100%', borderRadius: '6px' }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        {health.status === 'ok' && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: 0.4, animation: 'db-pulse 2s ease-in-out infinite' }} />
        )}
      </div>
      <span style={{ fontSize: '11px', color: C.sand }}>{label}</span>
      {health.latency_ms !== null && health.status === 'ok' && (
        <span style={{ fontSize: '10px', color: C.taupe, marginLeft: 'auto' }}>{health.latency_ms}ms</span>
      )}
      <style>{`@keyframes db-pulse { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(2.2);opacity:0} }`}</style>
    </button>
  )
}

// ── Full card for the Overview page ─────────────────────────────────────────
export function DatabaseStatusCard() {
  const [health, setHealth] = useState<HealthResult>(EMPTY)
  const [spinning, setSpinning] = useState(false)

  const refresh = useCallback(async () => {
    setSpinning(true)
    setHealth(h => ({ ...h, status: 'checking' }))
    const result = await checkHealth()
    setHealth(result)
    setSpinning(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(id)
  }, [refresh])

  const isOk = health.status === 'ok'
  const isError = health.status === 'error'
  const isChecking = health.status === 'checking'

  const borderColor = isOk ? 'rgba(74,222,128,0.25)' : isError ? 'rgba(224,123,112,0.3)' : 'rgba(250,225,192,0.08)'
  const bgColor = isOk ? 'rgba(74,222,128,0.06)' : isError ? 'rgba(224,123,112,0.06)' : C.espresso

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Status card */}
      <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '12px', padding: '20px 24px', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={15} style={{ color: isOk ? '#4ade80' : isError ? '#e07b70' : C.taupe }} />
            <p style={{ fontSize: '13px', fontWeight: 600, color: C.ivory }}>Database Connection</p>
          </div>
          <button onClick={refresh} title="Check now" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.taupe, display: 'flex', alignItems: 'center', padding: '4px' }}>
            <RefreshCw size={13} style={{ animation: spinning ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          {isOk && <CheckCircle size={22} style={{ color: '#4ade80', flexShrink: 0 }} />}
          {isError && <XCircle size={22} style={{ color: '#e07b70', flexShrink: 0 }} />}
          {isChecking && <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${C.taupe}`, borderTopColor: C.bronze, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: isOk ? '#4ade80' : isError ? '#e07b70' : C.sand }}>
              {isOk ? 'Connected' : isError ? 'Connection Error' : 'Checking…'}
            </p>
            {isError && health.error && (
              <p style={{ fontSize: '11px', color: '#e07b70', marginTop: '2px', opacity: 0.8 }}>{health.error}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <Stat icon={<Clock size={11} />} label="Latency" value={health.latency_ms !== null ? `${health.latency_ms}ms` : '—'} ok={isOk} />
          <Stat icon={<Database size={11} />} label="Provider" value={health.provider ?? 'Supabase'} ok={isOk} />
          <Stat icon={<RefreshCw size={11} />} label="Last Checked" value={health.checkedAt ? fmt(health.checkedAt) : '—'} ok={isOk} />
        </div>
      </div>

      {/* Keepalive setup card */}
      <div style={{ background: C.espresso, border: `1px solid rgba(250,225,192,0.08)`, borderRadius: '12px', padding: '20px 24px', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: C.ivory }}>cron-job.org Keepalive</p>
          <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.bronze, textDecoration: 'none' }}>
            Open <ExternalLink size={10} />
          </a>
        </div>
        <p style={{ fontSize: '12px', color: C.taupe, marginBottom: '16px' }}>
          Schedule: <strong style={{ color: C.sand }}>every 5 minutes</strong> · Method: <strong style={{ color: C.sand }}>GET</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <FieldRow label="URL (Common tab)" value={health.keepaliveUrl ?? KEEPALIVE_URL} />
          <FieldRow label="Header key (Advanced tab)" value="apikey" />
          <FieldRow label="Header value (Advanced tab)" value={health.keepaliveHeaders?.apikey ?? KEEPALIVE_HEADERS.apikey} mono />
          <FieldRow label="Second header key" value="Authorization" />
          <FieldRow label="Second header value" value={health.keepaliveHeaders?.Authorization ?? AUTH_HEADER} mono />
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function Stat({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div style={{ background: 'rgba(22,18,18,0.35)', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', color: C.taupe }}>
        {icon}
        <span style={{ fontSize: '10px', letterSpacing: '0.08em' }}>{label.toUpperCase()}</span>
      </div>
      <p style={{ fontSize: '13px', fontWeight: 500, color: ok ? C.ivory : C.taupe }}>{value}</p>
    </div>
  )
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: '10px', color: C.taupe, letterSpacing: '0.08em', marginBottom: '4px' }}>{label.toUpperCase()}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(22,18,18,0.5)', border: `1px solid rgba(250,225,192,0.1)`, borderRadius: '7px', padding: '8px 10px' }}>
        <p style={{ fontSize: mono ? '10px' : '12px', color: C.ivory, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }}>
          {value}
        </p>
        <CopyButton text={value} />
      </div>
    </div>
  )
}
