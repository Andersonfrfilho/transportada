/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_CONTEXT } from '../fixtures/nfe-import-application.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { documentsListRequest, responseApiError } from '../fixtures/nfe-http-request.fixture'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000230'
const CURSOR = `2026-09-14T10:15:30.123456Z::2026-09-13T08:00:00.000000Z::${DOCUMENT_ID}`

/**
 * A listagem abre pela nota atualizada por último, desempata pela emissão e depois pelo id. O cursor
 * carrega as três chaves; o de antes (`<emissão>::<id>`) não aponta para lugar nenhum nessa ordem, e
 * aceitá-lo devolveria uma página errada sem ninguém perceber.
 */
describe('NF-e document listing cursor over the newest-first order', () => {
  test('accepts the three-key cursor and hands it to the application layer untouched', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({ query: `?cursor=${CURSOR}&limit=10` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls).toEqual([
      { accessKey: null, context: COMPANY_CONTEXT, cursor: CURSOR, limit: 10 },
    ])
  })

  test('answers 400 to the cursor minted before the order carried the update time', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({ query: `?cursor=2026-07-22T14:01:00.000Z::${DOCUMENT_ID}` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.documentListCalls).toEqual([])
  })

  /** Sem os microssegundos, duas notas gravadas no mesmo milésimo trocariam de página. */
  test('answers 400 to a cursor that lost the microseconds, a key or the id', async () => {
    const malformed = [
      `2026-09-14T10:15:30.123Z::2026-09-13T08:00:00.000Z::${DOCUMENT_ID}`,
      `2026-09-14T10:15:30.123456Z::${DOCUMENT_ID}`,
      '2026-09-14T10:15:30.123456Z::2026-09-13T08:00:00.000000Z::not-a-uuid',
      `2026-09-14T10:15:30.123456Z::2026-02-30T08:00:00.000000Z::${DOCUMENT_ID}`,
      `${CURSOR}::${DOCUMENT_ID}`,
    ]

    for (const cursor of malformed) {
      const fixture = await createNfeHttpFixture()
      const response = await fixture.handle(documentsListRequest({ query: `?cursor=${cursor}` }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.documentListCalls).toEqual([])
    }
  })
})
