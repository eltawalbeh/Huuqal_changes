import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PUBLIC_REVISION_CHECK_MS,
  hasCachedCmsData,
  shouldCheckRevision,
  shouldLoadFullCms,
} from '../src/app/utils/cmsSyncPolicy.js'

test('public CMS revision requests are throttled to 15 minutes', () => {
  assert.equal(PUBLIC_REVISION_CHECK_MS, 900_000)
  assert.equal(shouldCheckRevision({ lastRevisionCheck: 1_000 }, 1_000 + 899_999), false)
  assert.equal(shouldCheckRevision({ lastRevisionCheck: 1_000 }, 1_000 + 900_000), true)
})

test('empty browser cache still requests first CMS payload', () => {
  const store = { getItem: () => null }
  assert.equal(hasCachedCmsData(store), false)
  assert.equal(shouldLoadFullCms({ isAdmin: false, forceFull: false, cached: false, localRevision: null, serverRevision: null }), true)
})

test('cached public data reloads only after a revision change', () => {
  const base = { isAdmin: false, forceFull: false, cached: true }
  assert.equal(shouldLoadFullCms({ ...base, localRevision: 'v1', serverRevision: 'v1' }), false)
  assert.equal(shouldLoadFullCms({ ...base, localRevision: 'v1', serverRevision: 'v2' }), true)
  assert.equal(shouldLoadFullCms({ ...base, localRevision: 'v1', serverRevision: null }), false)
})

test('admin or forced refresh still requests current data', () => {
  const base = { cached: true, localRevision: 'same', serverRevision: 'same' }
  assert.equal(shouldLoadFullCms({ ...base, isAdmin: true, forceFull: false }), true)
  assert.equal(shouldLoadFullCms({ ...base, isAdmin: false, forceFull: true }), true)
})

test('static guards: no public seeding, quota-aware reads, and upload cache TTL', () => {
  const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8')
  const cms = readFileSync(new URL('../src/app/utils/cms.ts', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/server/index.tsx', import.meta.url), 'utf8')
  assert.ok(app.includes("cmsLoadResult('revision')"))
  assert.ok(!app.includes("cmsSave('menu'"))
  assert.ok(cms.includes('quotaBlockedUntil'))
  assert.ok(cms.includes('pendingLoads'))
  assert.ok(cms.includes("'cache-control': '604800'"))
  assert.ok(edge.includes("cacheControl: '604800'"))
  assert.ok(edge.includes('"categories", "revision"'))
})
