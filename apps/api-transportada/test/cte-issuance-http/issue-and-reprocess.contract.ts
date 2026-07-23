/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  ISSUE_IDEMPOTENCY_KEY,
  REPROCESS_IDEMPOTENCY_KEY,
  createCteIssuanceHttpFixture,
  issueBatchRequest,
  reprocessItemRequest,
  responseApiError,
} from '../fixtures/cte-issuance-http.fixture.js'

describe('CT-e issuance HTTP issue and reprocess contract', () => {
  test('issues a batch asynchronously without invoking the fiscal provider in HTTP', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(issueBatchRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      data: {
        batchId: BATCH_ID,
        requestedAt: '2026-07-23T12:00:00.000Z',
        status: 'requested',
      },
    })
    expect(fixture.issueCalls).toEqual([
      {
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: 'cte-issuance-http-correlation',
        idempotencyKey: ISSUE_IDEMPOTENCY_KEY,
      },
    ])
  })

  test('rejects tenant selectors, unknown fields and production fiscal environment before application work', async () => {
    for (const body of [
      { companyId: 'attacker-company' },
      { unknown: true },
      { environment: 'production' },
    ]) {
      const fixture = await createCteIssuanceHttpFixture()
      const response = await fixture.handle(issueBatchRequest({ body }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.issueCalls).toEqual([])
    }
  })

  test('reprocesses only the item path with a bounded audit reason', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(reprocessItemRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      data: {
        attemptId: '00000000-0000-4000-8000-000000000603',
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        status: 'requested',
      },
    })
    expect(fixture.reprocessCalls).toEqual([
      {
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        context: COMPANY_CONTEXT,
        correlationId: 'cte-issuance-http-correlation',
        idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
        reason: 'Correção de dados de homologação',
      },
    ])
  })

  test('propagates safe 404 and 409 errors without tenant leakage', async () => {
    for (const error of [
      new ApiError({
        code: 'CTE_ISSUANCE_NOT_FOUND',
        message: 'CT-e issuance not found',
        status: 404,
      }),
      new ApiError({
        code: 'CTE_REPROCESS_NOT_ALLOWED',
        message: 'CT-e item cannot be reprocessed',
        status: 409,
      }),
    ]) {
      const fixture = await createCteIssuanceHttpFixture({ reprocessError: error })
      const response = await fixture.handle(reprocessItemRequest())
      const body = await responseApiError(response)
      expect(response.status).toBe(error.status)
      expect(body.error.code).toBe(error.code)
      expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
    }
  })
})
