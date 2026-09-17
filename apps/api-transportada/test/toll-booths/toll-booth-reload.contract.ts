/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302: `POST /v1/toll-booths/reload` — `settings.manage`, extrato registrado, integridade
 * conferida antes de travar, `observed_on` da linha (nunca hoje), ator do contexto, e os 404/409 de
 * domínio. A trava de verdade e a idempotência são provadas contra Postgres/MinIO em
 * `test/integration/toll-booth-reload.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES } from '../../src/shared/api.constant.js'
import {
  buildExtractRow,
  createReloadFixture,
  encodeExtract,
  RELOAD_BOOTH_ROW,
  RELOAD_COMPANY_ID,
  RELOAD_CORRELATION_ID,
  RELOAD_USER_ID,
} from '../fixtures/toll-booth-reload-http.fixture.js'

const QUERY = '?dataset=sudeste&observedOn=2026-09-14'
const EXTRACT_BYTES = encodeExtract([RELOAD_BOOTH_ROW])

async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } }
  return body.error.code
}

function validFixture(overrides: Parameters<typeof createReloadFixture>[0] = {}) {
  return createReloadFixture({
    extract: buildExtractRow(EXTRACT_BYTES),
    objectBytes: EXTRACT_BYTES,
    ...overrides,
  })
}

describe('POST /toll-booths/reload http contract (spec 154, T302)', () => {
  test('answers 403 without settings.manage and touches nothing', async () => {
    const fixture = validFixture({ permissions: new Set(['fleet.read']) })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(403)
    expect(fixture.events).toEqual([])
  })

  test('answers 400 on an invalid query and on an extra query key', async () => {
    const fixture = validFixture()

    expect((await fixture.handle('?dataset=Sudeste!&observedOn=2026-09-14')).status).toBe(400)
    expect((await fixture.handle(`${QUERY}&companyId=${RELOAD_COMPANY_ID}`)).status).toBe(400)
    expect(fixture.events).toEqual([])
  })

  test('answers 404 for an unregistered extract without touching the storage', async () => {
    const fixture = validFixture({ extract: undefined })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(404)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_EXTRACT_NOT_FOUND')
    expect(fixture.events).toEqual(['find:sudeste:2026-09-14'])
  })

  test('answers 409 when the object is gone, marks the row and never takes the lock', async () => {
    const fixture = validFixture({ objectBytes: undefined })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(409)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_EXTRACT_OBJECT_MISSING')
    expect(fixture.markedMissing).toEqual([{ dataset: 'sudeste', observedOn: '2026-09-14' }])
    expect(fixture.events).not.toContain('runExclusive')
  })

  test('answers 409 without downloading when the object exceeds the size ceiling', async () => {
    const fixture = validFixture({
      objectContentLength: APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES + 1,
    })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(409)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH')
    expect(fixture.events).not.toContain('read')
  })

  test('answers 409 on a sha256 mismatch without seeding or recording a reload', async () => {
    const fixture = validFixture({
      objectBytes: encodeExtract([{ ...RELOAD_BOOTH_ROW, chargeCar: '9.9900' }]),
    })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(409)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH')
    expect(fixture.savedBooths).toEqual([])
    expect(fixture.markedReloaded).toEqual([])
    expect(fixture.events).not.toContain('runExclusive')
  })

  test('answers 409 when the extract repeats an osmNodeId', async () => {
    const repeated = encodeExtract([RELOAD_BOOTH_ROW, RELOAD_BOOTH_ROW])
    const fixture = validFixture({ extract: buildExtractRow(repeated), objectBytes: repeated })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(409)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH')
    expect(fixture.events).not.toContain('runExclusive')
  })

  test('answers 409 when another reload holds the catalog lock', async () => {
    const fixture = validFixture({ isLocked: true })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(409)
    expect(await readErrorCode(response)).toBe('TOLL_BOOTH_CATALOG_RELOAD_IN_PROGRESS')
    expect(fixture.savedBooths).toEqual([])
  })

  test('downloads and verifies before locking, then seeds, marks and audits inside the lock', async () => {
    const fixture = validFixture()

    await fixture.handle(QUERY)

    expect(fixture.events).toEqual([
      'find:sudeste:2026-09-14',
      'head',
      'read',
      'runExclusive',
      'saveMany',
      'readCatalogSummary',
      'markReloaded',
      'insertAudit',
    ])
  })

  test("seeds with the row's observedOn and records the actor from the context", async () => {
    const fixture = validFixture()

    await fixture.handle(QUERY)

    expect(fixture.savedBooths.map((booth) => booth.observedOn)).toEqual(['2026-09-14'])
    expect(fixture.savedBooths[0]?.osmNodeId).toBe(25_937_851n)
    expect(fixture.markedReloaded).toEqual([
      {
        dataset: 'sudeste',
        observedOn: '2026-09-14',
        reloadedBoothCount: 1,
        reloadedByUserId: RELOAD_USER_ID,
      },
    ])
    const sha256 = buildExtractRow(EXTRACT_BYTES).sha256
    expect(fixture.audits).toEqual([
      {
        actorUserId: RELOAD_USER_ID,
        companyId: RELOAD_COMPANY_ID,
        correlationId: RELOAD_CORRELATION_ID,
        entityId: `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-${sha256.slice(12, 16)}-${sha256.slice(16, 20)}-${sha256.slice(20, 32)}`,
        metadata: { dataset: 'sudeste', observedOn: '2026-09-14', savedBoothCount: 1 },
      },
    ])
  })

  test('answers 200 with the reload summary and no-store', async () => {
    const fixture = validFixture({ catalogBoothCount: 5 })

    const response = await fixture.handle(QUERY)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: {
        boothsMissingFromExtract: 4,
        catalogBoothCount: 5,
        dataset: 'sudeste',
        observedOn: '2026-09-14',
        reloadedAt: '2026-09-17T12:00:00.000Z',
        reloadedByUserId: RELOAD_USER_ID,
        savedBoothCount: 1,
      },
    })
  })
})
