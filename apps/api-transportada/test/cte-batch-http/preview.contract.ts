import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_MAX_DOCUMENTS } from '../../src/cte-batches/domain/cte-batch-limits.constant.js'
import {
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  PREVIEW_RESULT,
  READ_ONLY_CONTEXT,
  createCteBatchHttpFixture,
  previewBatchRequest,
  responseApiError,
} from '../fixtures/cte-batch-http.fixture.js'

const PROFILE_ID = '00000000-0000-4000-8000-000000000506'

describe('CT-e batch preview HTTP contract', () => {
  test('projects the selection without persisting and without caching', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(previewBatchRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(200)
    expect(responseBody).toEqual({ data: PREVIEW_RESULT })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.previewCalls).toEqual([{ context: COMPANY_CONTEXT, documentIds: [DOCUMENT_ID] }])
    expect(fixture.createCalls).toEqual([])
    expect(fixture.submitCalls).toEqual([])
  })

  test('forwards the optional profile and grouping selectors', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      previewBatchRequest({
        body: {
          documentIds: [DOCUMENT_ID],
          emissionProfileId: PROFILE_ID,
          groupingMode: 'sender_recipient',
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.previewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        documentIds: [DOCUMENT_ID],
        emissionProfileId: PROFILE_ID,
        groupingMode: 'sender_recipient',
      },
    ])
  })

  test('rejects tenant selectors, unknown fields and invalid grouping before application work', async () => {
    const fixture = await createCteBatchHttpFixture()

    const bodies = [
      { companyId: 'attacker-company', documentIds: [DOCUMENT_ID] },
      { documentIds: [DOCUMENT_ID], groupingMode: 'per_state' },
      { documentIds: ['not-a-uuid'] },
      { documentIds: [] },
      { documentIds: [DOCUMENT_ID], emissionProfileId: 'not-a-uuid' },
    ]

    for (const body of bodies) {
      const response = await fixture.handle(previewBatchRequest({ body }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    }
    expect(fixture.previewCalls).toEqual([])
  })

  /**
   * O teto anterior de 100 rejeitava a seleção inteira da tela de notas, que pagina até 1000. O
   * corte precisa estar acima do que a UI consegue selecionar, senão "selecionar todos" devolve 400.
   */
  test('accepts a selection up to the documented ceiling and rejects the item past it', async () => {
    const fixture = await createCteBatchHttpFixture()
    const documentIds = Array.from({ length: CTE_BATCH_MAX_DOCUMENTS }, () => crypto.randomUUID())

    const accepted = await fixture.handle(previewBatchRequest({ body: { documentIds } }))
    const rejected = await fixture.handle(
      previewBatchRequest({ body: { documentIds: [...documentIds, crypto.randomUUID()] } }),
    )

    expect(accepted.status).toBe(200)
    expect(rejected.status).toBe(400)
    expect(fixture.previewCalls).toEqual([{ context: COMPANY_CONTEXT, documentIds }])
  })

  test('requires the cte.manage permission', async () => {
    const fixture = await createCteBatchHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(previewBatchRequest())

    expect(response.status).toBe(403)
    expect(fixture.previewCalls).toEqual([])
  })
})
