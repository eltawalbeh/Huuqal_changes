/**
 * HuuQa secondary CMS backend (Neon Free).
 * Only PUBLIC Neon endpoints belong in frontend source. Never bundle a
 * PostgreSQL connection string, API key, or privileged credential.
 * Neon Data API enforces PostgreSQL RLS; anonymous users can only SELECT.
 */
import { createClient } from '@neondatabase/neon-js'

export const NEON_AUTH_URL = 'https://ep-solitary-fire-ao4s6d80.neonauth.c-2.ap-southeast-1.aws.neon.tech/huuqacms/auth'
export const NEON_DATA_API_URL = 'https://ep-solitary-fire-ao4s6d80.apirest.c-2.ap-southeast-1.aws.neon.tech/huuqacms/rest/v1'

export const neonClient = createClient({
  auth: { url: NEON_AUTH_URL, allowAnonymous: true },
  dataApi: { url: NEON_DATA_API_URL },
})

// This client NEVER falls back to an anonymous token. CMS writes must carry
// the verified administrator's real session, even if public reads are anonymous.
export const neonAdminClient = createClient({
  auth: { url: NEON_AUTH_URL, allowAnonymous: false },
  dataApi: { url: NEON_DATA_API_URL },
})

export const NEON_CMS_SECTIONS = new Set(['settings','content','seo','menu','seed_version','categories','revision'])

export async function neonReadCms(section: string): Promise<any> {
  if (!NEON_CMS_SECTIONS.has(section)) throw new Error('Unsupported CMS section')
  const { data, error } = await neonClient
    .from('cms_store')
    .select('value')
    .eq('key', `cms:${section}`)
    .maybeSingle()
  if (error) throw new Error(`Neon CMS read ${section}: ${error.message}`)
  return data?.value ?? null
}

export async function neonWriteCms(section: string, value: unknown): Promise<void> {
  if (!NEON_CMS_SECTIONS.has(section)) throw new Error('Unsupported CMS section')

  const { data: session, error: sessionError } = await neonAdminClient.auth.getSession()
  if (sessionError || !session?.session || !session?.user?.id) {
    throw new Error('Neon CMS session unavailable. Sign out and sign in to Secure CMS Publishing again.')
  }
  if (session.user.emailVerified === false) {
    throw new Error('Verify your Neon account email before publishing.')
  }

  // Server-side identity check; returns only approval flags, never credentials.
  // This distinguishes a missing/mismatched JWT from a broken RLS policy.
  const { data: access, error: accessError } = await neonAdminClient.rpc('cms_publish_access')
  if (accessError) {
    throw new Error('Cannot verify your CMS publishing identity: ' + accessError.message + '. Sign out and back in to Neon CMS.')
  }
  if (!access || access.signed_in !== true || access.approved !== true) {
    throw new Error('This request is not recognized as the approved Neon CMS administrator. Sign out and back in. Token role: ' + (access?.role ?? 'missing'))
  }

  const { error } = await neonAdminClient
    .from('cms_store')
    .upsert({ key: `cms:${section}`, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error('Neon CMS publishing failed: ' + error.message)
}
