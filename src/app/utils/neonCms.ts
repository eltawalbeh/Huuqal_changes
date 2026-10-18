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
  const { data: session, error: sessionError } = await neonClient.auth.getSession()
  if (sessionError || !session?.user?.id) {
    throw new Error('Please sign in with your approved Neon CMS administrator account.')
  }
  const { error } = await neonClient
    .from('cms_store')
    .upsert({ key: `cms:${section}`, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`Neon CMS publishing denied: ${error.message}. Verify this account is approved for CMS writes.`)
}
