import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_SUMMARY,
  COMPANY_CONTEXT,
  CTE_BATCHES_PATH,
  DOCUMENT_ID,
  EMISSION_PROFILE_ID,
  EVENTS_PAGE,
  IDEMPOTENCY_KEY,
  SUBMIT_IDEMPOTENCY_KEY,
  createBatchRequest,
  createCteBatchHttpFixture,
  getBatchEventsRequest,
  getBatchRequest,
  listBatchesRequest,
  responseApiError,
  submitBatchRequest,
} from '../fixtures/cte-batch-http.fixture.js'

describe('CT-e batch HTTP create, submit, and query contract', () => {
  test('rejects tenant selectors and unknown create fields before application work', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      createBatchRequest({
        body: {
          companyId: 'attacker-company',
          documentIds: [DOCUMENT_ID],
          name: 'Lote CT-e julho',
        },
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.createCalls).toEqual([])
  })

  test('creates a strict draft batch with authenticated tenant and no fiscal payload fields', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(createBatchRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(201)
    expect(responseBody).toEqual({ data: BATCH_SUMMARY })
    expect(fixture.createCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'cte-batch-http-correlation',
        documentIds: [DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: 'Lote CT-e julho',
      },
    ])
    expect(JSON.stringify(responseBody)).not.toContain('xml')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('forwards the emission profile and grouping mode selected during note selection', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      createBatchRequest({
        body: {
          documentIds: [DOCUMENT_ID],
          emissionProfileId: EMISSION_PROFILE_ID,
          groupingMode: 'sender_recipient',
          name: 'Lote CT-e julho',
        },
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'cte-batch-http-correlation',
        documentIds: [DOCUMENT_ID],
        emissionProfileId: EMISSION_PROFILE_ID,
        groupingMode: 'sender_recipient',
        idempotencyKey: IDEMPOTENCY_KEY,
        name: 'Lote CT-e julho',
      },
    ])
  })

  test('rejects an unknown grouping mode before application work', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      createBatchRequest({
        body: {
          documentIds: [DOCUMENT_ID],
          groupingMode: 'per_carrier',
          name: 'Lote CT-e julho',
        },
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.createCalls).toEqual([])
  })

  test('submits a batch by path id with idempotency key and returns processing state', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(submitBatchRequest())

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      data: {
        ...BATCH_SUMMARY,
        status: 'submitted',
      },
    })
    expect(fixture.submitCalls).toEqual([
      {
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: 'cte-batch-http-correlation',
        idempotencyKey: SUBMIT_IDEMPOTENCY_KEY,
      },
    ])
  })

  test('lists, details, and events use cte.submit scope with stable pagination', async () => {
    const fixture = await createCteBatchHttpFixture()

    const listResponse = await fixture.handle(listBatchesRequest({ search: '?limit=25' }))
    const detailResponse = await fixture.handle(getBatchRequest())
    const eventsResponse = await fixture.handle(getBatchEventsRequest())

    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({
      data: [BATCH_SUMMARY],
      page: { nextCursor: null },
    })
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual({ data: BATCH_SUMMARY })
    expect(eventsResponse.status).toBe(200)
    expect(await eventsResponse.json()).toEqual({
      data: EVENTS_PAGE.items,
      page: { nextCursor: null },
    })
    expect(fixture.listCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        limit: 25,
      },
    ])
    expect(fixture.getCalls).toEqual([{ batchId: BATCH_ID, context: COMPANY_CONTEXT }])
    expect(fixture.listEventCalls).toEqual([
      {
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        cursor: null,
        limit: 25,
      },
    ])
  })

  test('propagates safe not-found and conflict errors without tenant leakage', async () => {
    const fixture = await createCteBatchHttpFixture({
      submitError: new ApiError({
        code: 'CTE_BATCH_NOT_FOUND',
        message: 'CT-e batch was not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(submitBatchRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('CTE_BATCH_NOT_FOUND')
    expect(JSON.stringify(responseBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('documents the CT-e batch routes explicitly', () => {
    expect(CTE_BATCHES_PATH).toBe('/cte-batches')
    expect(`${CTE_BATCHES_PATH}/${BATCH_ID}`).toBe(
      '/cte-batches/00000000-0000-4000-8000-000000000501',
    )
    expect(`${CTE_BATCHES_PATH}/${BATCH_ID}/submit`).toBe(
      '/cte-batches/00000000-0000-4000-8000-000000000501/submit',
    )
    expect(`${CTE_BATCHES_PATH}/${BATCH_ID}/events`).toBe(
      '/cte-batches/00000000-0000-4000-8000-000000000501/events',
    )
  })
})
