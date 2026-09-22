/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T301: `POST`/`GET /v1/toll-booths/extracts` — `settings.manage`, `201` com a linha,
 * `409` no duplicado (linha ou objeto) sem sobrescrever, `400` com todos os erros de validação
 * juntos, `403` sem a permissão, listagem do mais novo para o mais antigo.
 */
import { describe, expect, test } from 'bun:test'

import {
  TollBoothExtractDuplicateError,
  TollBoothExtractObjectConflictError,
} from '../../src/toll-booths/domain/toll-booth-extract.error.js'
import {
  BOOTH_ROW,
  createExtractUploadFixture as createFixture,
  EXTRACT_ROW,
  getRequest,
  postRequest,
  USER_ID,
} from '../fixtures/toll-booth-extract-http.fixture.js'

describe('POST /toll-booths/extracts http contract (spec 154, T301)', () => {
  test('answers 201 with the registered row', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )
    const body = (await response.json()) as { data: Record<string, unknown> }

    expect(response.status).toBe(201)
    expect(body.data.dataset).toBe('sudeste')
    expect(body.data.boothCount).toBe(1)
  })

  test('reads dataset/observedOn from the query and the actor from the token, never the body', async () => {
    const fixture = await createFixture()

    await fixture.handle(postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]))

    expect(fixture.createExtractCalls).toEqual([
      {
        actorUserId: USER_ID,
        booths: [BOOTH_ROW],
        dataset: 'sudeste',
        observedOn: '2026-09-14',
        rawBody: undefined,
      },
    ])
  })

  test('answers 409 when the (dataset, observedOn) pair is already registered', async () => {
    const fixture = await createFixture({
      createExtractImpl: async () => {
        throw new TollBoothExtractDuplicateError()
      },
    })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOLL_BOOTH_EXTRACT_DUPLICATE')
  })

  test('answers 409 when the object already exists with different content, without overwriting it', async () => {
    const fixture = await createFixture({
      createExtractImpl: async () => {
        throw new TollBoothExtractObjectConflictError()
      },
    })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOLL_BOOTH_EXTRACT_OBJECT_CONFLICT')
  })

  test('answers 400 with every validation issue at once on a malformed extract', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        { ...BOOTH_ROW, chargeCar: '4.20', osmNodeId: 'abc' },
      ]),
    )
    const body = (await response.json()) as { error: { details: readonly unknown[] } }

    expect(response.status).toBe(400)
    expect(body.error.details.length).toBeGreaterThanOrEqual(2)
  })

  test('answers 400 when the same osmNodeId repeats in the extract', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        BOOTH_ROW,
        { ...BOOTH_ROW, name: 'Barueri - 3' },
      ]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 400 when latitude or longitude is out of range', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        { ...BOOTH_ROW, latitude: '-99.0000000' },
      ]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 400 on an invalid dataset in the query string', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=Sudeste!&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 403 without settings.manage', async () => {
    const fixture = await createFixture({ permissions: new Set() })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(403)
  })
})

describe('GET /toll-booths/extracts http contract (spec 154, T301)', () => {
  test('answers 200 with the extracts, newest first', async () => {
    const olderExtract = { ...EXTRACT_ROW, dataset: 'sudeste', observedOn: '2026-08-01' }
    const fixture = await createFixture({ listExtractsResult: [EXTRACT_ROW, olderExtract] })

    const response = await fixture.handle(getRequest())
    const body = (await response.json()) as { data: readonly Record<string, unknown>[] }

    expect(response.status).toBe(200)
    expect(body.data.map((row) => row.observedOn)).toEqual(['2026-09-14', '2026-08-01'])
  })

  test('answers 403 without settings.manage', async () => {
    const fixture = await createFixture({ permissions: new Set() })

    const response = await fixture.handle(getRequest())

    expect(response.status).toBe(403)
  })
})
