import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_SUMMARY,
  COMPANY_CONTEXT,
  CTE_BATCHES_PATH,
  DOCUMENT_ID,
  FISCAL_DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  ITEM_ID,
  ITEMS_RESULT,
  MANAGE_ONLY_CONTEXT,
  READ_ONLY_CONTEXT,
  appendBatchItemsRequest,
  createCteBatchHttpFixture,
  deleteBatchItemRequest,
  getBatchItemsRequest,
  responseApiError,
} from '../fixtures/cte-batch-http.fixture.js'

describe('CT-e batch HTTP item listing contract', () => {
  test('lists the CT-es of a batch with the notes linked to each one', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(getBatchItemsRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: ITEMS_RESULT.items })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.listItemCalls).toEqual([{ batchId: BATCH_ID, context: COMPANY_CONTEXT }])
  })

  test('exposes the fiscal document identifier of each authorized CT-e', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(getBatchItemsRequest())
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(body.data[0]?.['fiscalDocumentId']).toBe(FISCAL_DOCUMENT_ID)
  })

  /**
   * Quando a SEFAZ acusa duplicidade de numeração o worker avança o número do CT-e sozinho. A tela
   * precisa dizer que o número mudou e por quê — número novo sem explicação parece erro do sistema.
   */
  test('exposes why the fiscal number of an item was advanced', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(getBatchItemsRequest())
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(body.data[0]?.['fiscalNumberChange']).toEqual({
      previousNumber: '14',
      reason: 'sefaz_duplicate_number',
      rejectionCode: '539',
    })
  })

  test('rejects a non-uuid batch identifier before application work', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(getBatchItemsRequest({ batchId: 'not-a-uuid' }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('NOT_FOUND')
    expect(fixture.listItemCalls).toEqual([])
  })

  test('requires cte.submit to read batch items', async () => {
    const fixture = await createCteBatchHttpFixture({
      permissions: MANAGE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(getBatchItemsRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.listItemCalls).toEqual([])
  })

  test('propagates a safe not-found without tenant leakage', async () => {
    const fixture = await createCteBatchHttpFixture({
      listItemsError: new ApiError({
        code: 'CTE_BATCH_NOT_FOUND',
        message: 'CT-e batch was not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(getBatchItemsRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('CTE_BATCH_NOT_FOUND')
    expect(JSON.stringify(responseBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('documents the CT-e batch items route explicitly', () => {
    expect(`${CTE_BATCHES_PATH}/${BATCH_ID}/items`).toBe(
      '/cte-batches/00000000-0000-4000-8000-000000000501/items',
    )
  })
})

/**
 * Uma seleção grande não cabe num corpo de 1 MiB, então ela chega fatiada — mas o operador escolheu
 * um lote só e é um lote só que ele recebe: as fatias seguintes acrescentam itens ao mesmo rascunho.
 */
describe('CT-e batch HTTP item append contract', () => {
  test('appends a later slice to the same batch and answers with the refreshed batch', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(appendBatchItemsRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        correlationId: BATCH_SUMMARY.correlationId,
        createdAt: BATCH_SUMMARY.createdAt,
        id: BATCH_ID,
        itemCount: 3,
        name: BATCH_SUMMARY.name,
        status: 'draft',
        updatedAt: BATCH_SUMMARY.updatedAt,
        version: '2',
      },
    })
    expect(fixture.appendItemCalls).toEqual([
      {
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: 'cte-batch-http-correlation',
        documentIds: [DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ])
  })

  test('refuses a slice that carries a company identifier of its own', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      appendBatchItemsRequest({
        body: { companyId: 'attacker-company', documentIds: [DOCUMENT_ID] },
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.appendItemCalls).toEqual([])
  })

  test('requires cte.manage to append items', async () => {
    const fixture = await createCteBatchHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(appendBatchItemsRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.appendItemCalls).toEqual([])
  })

  test('propagates the invalid state of a batch that already left the draft', async () => {
    const fixture = await createCteBatchHttpFixture({
      appendItemsError: new ApiError({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      }),
    })

    const response = await fixture.handle(appendBatchItemsRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).error.code).toBe('CTE_BATCH_INVALID_STATE')
    expect(JSON.stringify(responseBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('keeps reading the items of a batch on the same path', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(getBatchItemsRequest())

    expect(response.status).toBe(200)
    expect(fixture.appendItemCalls).toEqual([])
  })
})

describe('CT-e batch HTTP item removal contract', () => {
  test('removes a draft item and answers with the refreshed batch', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(deleteBatchItemRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        correlationId: BATCH_SUMMARY.correlationId,
        createdAt: BATCH_SUMMARY.createdAt,
        id: BATCH_ID,
        itemCount: 0,
        name: BATCH_SUMMARY.name,
        status: 'draft',
        updatedAt: BATCH_SUMMARY.updatedAt,
        version: '2',
      },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.removeItemCalls).toEqual([
      {
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: 'cte-batch-http-correlation',
        itemId: ITEM_ID,
      },
    ])
  })

  test('rejects a non-uuid item identifier before application work', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(deleteBatchItemRequest({ itemId: 'not-a-uuid' }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('NOT_FOUND')
    expect(fixture.removeItemCalls).toEqual([])
  })

  test('requires cte.manage to remove an item', async () => {
    const fixture = await createCteBatchHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(deleteBatchItemRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.removeItemCalls).toEqual([])
  })

  test('propagates the invalid state without tenant leakage', async () => {
    const fixture = await createCteBatchHttpFixture({
      removeItemError: new ApiError({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      }),
    })

    const response = await fixture.handle(deleteBatchItemRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).error.code).toBe('CTE_BATCH_INVALID_STATE')
    expect(JSON.stringify(responseBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })
})
