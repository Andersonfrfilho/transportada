/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_ITEM_ID,
  CANCEL_CONTEXT,
  CANCEL_IDEMPOTENCY_KEY,
  CANCEL_JUSTIFICATION,
  COMPANY_CONTEXT,
  READ_ONLY_CONTEXT,
  cancelItemRequest,
  createCteIssuanceHttpFixture,
  responseApiError,
} from '../fixtures/cte-issuance-http.fixture.js'

type CancelFixtureParams = Readonly<{ cancelError?: Error }>

function createCancelFixture(params: CancelFixtureParams = {}) {
  return createCteIssuanceHttpFixture({
    ...params,
    permissions: CANCEL_CONTEXT.permissions,
  })
}

describe('CT-e issuance HTTP cancel contract', () => {
  test('accepts the cancellation asynchronously with the SEFAZ justification', async () => {
    const fixture = await createCancelFixture()

    const response = await fixture.handle(cancelItemRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      data: {
        attemptId: '00000000-0000-4000-8000-000000000603',
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        status: 'requested',
      },
    })
    expect(fixture.cancelCalls).toEqual([
      {
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        context: CANCEL_CONTEXT,
        correlationId: 'cte-issuance-http-correlation',
        idempotencyKey: CANCEL_IDEMPOTENCY_KEY,
        justification: CANCEL_JUSTIFICATION,
      },
    ])
  })

  test('rejects a justification shorter than the 15 characters SEFAZ demands', async () => {
    const fixture = await createCancelFixture()

    const response = await fixture.handle(cancelItemRequest({ body: { justification: 'erro' } }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.cancelCalls).toEqual([])
  })

  test('rejects tenant selectors, unknown fields and an oversized justification', async () => {
    for (const body of [
      { companyId: 'attacker-company', justification: CANCEL_JUSTIFICATION },
      { justification: CANCEL_JUSTIFICATION, unknown: true },
      { justification: 'a'.repeat(256) },
      {},
    ]) {
      const fixture = await createCancelFixture()
      const response = await fixture.handle(cancelItemRequest({ body }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.cancelCalls).toEqual([])
    }
  })

  test('requires the cte.cancel permission before reaching the application', async () => {
    for (const permissions of [READ_ONLY_CONTEXT.permissions, COMPANY_CONTEXT.permissions]) {
      const fixture = await createCteIssuanceHttpFixture({ permissions })

      const response = await fixture.handle(cancelItemRequest())

      expect(response.status).toBe(403)
      expect(fixture.cancelCalls).toEqual([])
    }
  })

  test('propagates safe 409 and 422 errors without tenant leakage', async () => {
    for (const error of [
      new ApiError({
        code: 'CTE_ISSUANCE_NOT_CANCELLABLE',
        message: 'CT-e issuance cannot be cancelled',
        status: 409,
      }),
      new ApiError({
        code: 'CTE_ISSUANCE_CANCELLATION_UNAVAILABLE',
        message: 'CT-e issuance has no authorization data to cancel',
        status: 422,
      }),
    ]) {
      const fixture = await createCancelFixture({ cancelError: error })
      const response = await fixture.handle(cancelItemRequest())
      const body = await responseApiError(response)
      expect(response.status).toBe(error.status)
      expect(body.error.code).toBe(error.code)
      expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
    }
  })

  test('demands an idempotency key so a retried cancel never fires a second event', async () => {
    const fixture = await createCancelFixture()
    const request = new Request(
      `http://api.test/cte-batches/${BATCH_ID}/items/${BATCH_ITEM_ID}/cancel`,
      {
        body: JSON.stringify({ justification: CANCEL_JUSTIFICATION }),
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await fixture.handle(request)

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.cancelCalls).toEqual([])
  })
})
