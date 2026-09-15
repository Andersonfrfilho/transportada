/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import { COMPANY_CONTEXT } from '../fixtures/nfe-import-application.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { DOCUMENT_EVENT, DOCUMENT_ID } from '../fixtures/nfe-http-payload.fixture'
import { documentEventsRequest, responseApiError } from '../fixtures/nfe-http-request.fixture'

const OTHER_ID = '00000000-0000-4000-8000-000000000231'
const CURSOR = `2026-07-22T14:00:00.000000Z::${DOCUMENT_ID}`

/**
 * Spec 149 D19/H9–H14 — a rota é fina: valida id e cursor/limit e devolve o que o repositório
 * já resolveu (origem, ator/solicitante por membership, nunca XML nem chave de storage). O que o
 * repositório resolve contra Postgres real está em `test/integration/nfe-document-events.integration.ts`.
 */
describe('GET /v1/nfe-documents/:id/events', () => {
  test('requires invoices.read, the same permission as the document detail', async () => {
    const fixture = await createNfeHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(documentEventsRequest())

    expect(response.status).toBe(403)
    expect(fixture.documentEventCalls).toEqual([])
  })

  test('hands the document id and default paging to the application layer', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentEventsRequest())

    expect(response.status).toBe(200)
    expect(fixture.documentEventCalls).toEqual([
      { context: COMPANY_CONTEXT, cursor: null, documentId: DOCUMENT_ID, limit: 20 },
    ])
  })

  test('serializes the entry without leaking xml or storage fields', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentEventsRequest())

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown[]; page: { nextCursor: string | null } }
    expect(body).toEqual({ data: [DOCUMENT_EVENT], page: { nextCursor: null } })
    expect(JSON.stringify(body)).not.toContain('xmlObjectId')
    expect(JSON.stringify(body)).not.toContain('storage')
  })

  /**
   * Spec 149 H13 — a rota repassa o que o repositório resolveu; distinguir "não havia ninguém" de
   * "havia id mas sem membership ativa" é responsabilidade do repositório, não da rota — aqui só
   * prova que a serialização não perde a distinção (nunca vaza o id cru em nenhum dos dois casos).
   */
  test('serializes a removed actor/requester as { removed: true }, never leaking the raw id', async () => {
    const fixture = await createNfeHttpFixture({
      documentEvents: {
        items: [{ ...DOCUMENT_EVENT, actor: { removed: true }, requestedBy: { removed: true } }],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(documentEventsRequest())

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: Array<{ actor: unknown; requestedBy: unknown }>
    }
    expect(body.data[0]?.actor).toEqual({ removed: true })
    expect(body.data[0]?.requestedBy).toEqual({ removed: true })
    // O evento padrão da fixture tem ator com id/nome resolvidos — nada disso pode vazar aqui.
    expect(JSON.stringify(body)).not.toContain('Fiscal Teste')
    expect(JSON.stringify(body)).not.toContain('00000000-0000-4000-8000-000000000901')
  })

  test('answers 404 when the repository does not find the document in this company', async () => {
    const notFound = new ApiError({
      code: 'NFE_DOCUMENT_NOT_FOUND',
      message: 'NF-e document not found',
      status: 404,
    })
    const fixture = await createNfeHttpFixture({ listDocumentEventsError: notFound })

    const response = await fixture.handle(documentEventsRequest(OTHER_ID))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('NFE_DOCUMENT_NOT_FOUND')
  })

  /** O router só casa `:id` com UUID canônico (`pathParameterFormat` padrão) — sem rota, sem chamada. */
  test('finds no route for a malformed document id, never reaching the application layer', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentEventsRequest('not-a-uuid'))

    expect(response.status).toBe(404)
    expect(fixture.documentEventCalls).toEqual([])
  })

  test('accepts the two-key cursor and a limit within the ceiling', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentEventsRequest(DOCUMENT_ID, { query: `?cursor=${CURSOR}&limit=100` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentEventCalls).toEqual([
      { context: COMPANY_CONTEXT, cursor: CURSOR, documentId: DOCUMENT_ID, limit: 100 },
    ])
  })

  test('answers 400 to a cursor without microseconds, without the id, or with an extra key', async () => {
    const malformed = [
      `2026-07-22T14:00:00.000Z::${DOCUMENT_ID}`,
      '2026-07-22T14:00:00.000000Z',
      `${CURSOR}::${DOCUMENT_ID}`,
      `2026-07-22T14:00:00.000000Z::not-a-uuid`,
    ]

    for (const cursor of malformed) {
      const fixture = await createNfeHttpFixture()
      const response = await fixture.handle(
        documentEventsRequest(DOCUMENT_ID, { query: `?cursor=${cursor}` }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.documentEventCalls).toEqual([])
    }
  })

  /** D19 — teto 100 (docs de APIs); acima disso é `400`, nunca clampado em silêncio (H14). */
  test('answers 400 to a limit above the ceiling of 100, and to a zero or negative one', async () => {
    for (const limit of ['101', '500', '0', '-1', 'abc']) {
      const fixture = await createNfeHttpFixture()
      const response = await fixture.handle(
        documentEventsRequest(DOCUMENT_ID, { query: `?limit=${limit}` }),
      )

      expect(response.status).toBe(400)
      expect(fixture.documentEventCalls).toEqual([])
    }
  })

  test('refuses an unknown query parameter and a repeated one', async () => {
    const fixture = await createNfeHttpFixture()

    const unknownKey = await fixture.handle(
      documentEventsRequest(DOCUMENT_ID, { query: '?accessKey=irrelevant' }),
    )
    expect(unknownKey.status).toBe(400)

    const repeated = await fixture.handle(
      documentEventsRequest(DOCUMENT_ID, { query: '?limit=10&limit=20' }),
    )
    expect(repeated.status).toBe(400)
    expect(fixture.documentEventCalls).toEqual([])
  })
})
