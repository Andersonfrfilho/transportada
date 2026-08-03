/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_NAME,
  COMPANY_CONTEXT,
  COMPANY_ITEMS_PAGE,
  CTE_BATCH_ITEMS_PATH,
  MANAGE_ONLY_CONTEXT,
  createCteBatchHttpFixture,
  listCompanyItemsRequest,
  responseApiError,
} from '../fixtures/cte-batch-http.fixture.js'

const CURSOR = '2026-07-22T20:00:00.000Z::00000000-0000-4000-8000-000000000507'
const REJECTED_SEARCHES = [
  '?limit=0',
  '?limit=101',
  '?limit=abc',
  '?cursor=broken',
  '?cursor=2026-07-22T20:00:00.000Z',
  `?batchId=not-a-uuid`,
  '?issuedFrom=2026-07-31T00:00:00.000Z&issuedUntil=2026-07-01T00:00:00.000Z',
  '?issuedFrom=yesterday',
  '?cteNumberGte=90&cteNumberLte=10',
  '?cteNumberGte=-1',
  '?invoiceNumberGte=900&invoiceNumberLte=100',
  '?invoiceNumberGte=1.5',
  '?statusIn=',
  '?statusIn=teleported',
  '?statusIn=pending,pending',
  '?billingStatusIn=',
  '?billingStatusIn=teleported',
  '?billingStatusIn=invoiced,invoiced',
  '?billingStatusIn=authorized',
  '?companyId=00000000-0000-4000-8000-000000000999',
  '?unknownFilter=1',
  '?limit=25&limit=50',
  '?cteNumberIn=',
  '?cteNumberIn=17,abc',
  '?cteNumberIn=17,17',
  '?invoiceNumberIn=',
  '?invoiceNumberIn=100,1.5',
  '?cteNumberIn=17&cteNumberGte=10',
  '?cteNumberIn=17&cteNumberLte=90',
  '?invoiceNumberIn=100&invoiceNumberGte=10',
  '?invoiceNumberIn=100&invoiceNumberLte=900',
] as const

describe('CT-e item listing HTTP contract', () => {
  test('lists the CT-es of the authenticated company with batch, date, and cursor', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(listCompanyItemsRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: COMPANY_ITEMS_PAGE.items,
      page: { nextCursor: COMPANY_ITEMS_PAGE.nextCursor },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.listCompanyItemCalls).toEqual([
      { context: COMPANY_CONTEXT, cursor: null, limit: 25 },
    ])
  })

  test('exposes the batch of each CT-e, since the row lives outside a batch screen', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(listCompanyItemsRequest())
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(body.data[0]?.['batchId']).toBe(BATCH_ID)
    expect(body.data[0]?.['batchName']).toBe(BATCH_NAME)
    expect(body.data[0]?.['createdAt']).toBe(COMPANY_ITEMS_PAGE.items[0].createdAt)
    expect(body.data[0]?.['totalAmount']).toBe(COMPANY_ITEMS_PAGE.items[0].totalAmount)
    expect(body.data[0]?.['baseAmount']).toBe(COMPANY_ITEMS_PAGE.items[0].baseAmount)
  })

  test('says whether each CT-e is already on an invoice, so the screen can filter it out', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(listCompanyItemsRequest())
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(body.data[0]?.['billingStatus']).toBe('invoiced')
  })

  test('forwards the billing status filter as a parsed list', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      listCompanyItemsRequest({ search: '?billingStatusIn=pending' }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listCompanyItemCalls[0]?.filters).toEqual({ billingStatusIn: ['pending'] })
  })

  test('forwards every filter that came in, and only those', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      listCompanyItemsRequest({
        search:
          `?cursor=${CURSOR}&limit=50&batchId=${BATCH_ID}` +
          '&issuedFrom=2026-07-01T00:00:00.000Z&issuedUntil=2026-07-31T23:59:59.000Z' +
          '&cteNumberGte=10&cteNumberLte=90&invoiceNumberGte=100&invoiceNumberLte=900' +
          '&statusIn=pending,failed,rejected',
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listCompanyItemCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: CURSOR,
        filters: {
          batchId: BATCH_ID,
          cteNumberGte: '10',
          cteNumberLte: '90',
          invoiceNumberGte: '100',
          invoiceNumberLte: '900',
          issuedFrom: '2026-07-01T00:00:00.000Z',
          issuedUntil: '2026-07-31T23:59:59.000Z',
          statusIn: ['pending', 'failed', 'rejected'],
        },
        limit: 50,
      },
    ])
  })

  test('omits the filters key entirely when no filter came in', async () => {
    const fixture = await createCteBatchHttpFixture()

    await fixture.handle(listCompanyItemsRequest({ search: '?limit=10' }))

    expect(fixture.listCompanyItemCalls[0]).toEqual({
      context: COMPANY_CONTEXT,
      cursor: null,
      limit: 10,
    })
  })

  test('accepts an equal-bound range, which selects a single number', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      listCompanyItemsRequest({ search: '?cteNumberGte=17&cteNumberLte=17' }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listCompanyItemCalls[0]?.filters).toEqual({
      cteNumberGte: '17',
      cteNumberLte: '17',
    })
  })

  test('forwards cteNumberIn and invoiceNumberIn as parsed lists', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(
      listCompanyItemsRequest({ search: '?cteNumberIn=17,90,4&invoiceNumberIn=100' }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listCompanyItemCalls[0]?.filters).toEqual({
      cteNumberIn: ['17', '90', '4'],
      invoiceNumberIn: ['100'],
    })
  })

  test.each([...REJECTED_SEARCHES])(
    'rejects %s before any application work',
    async (search: string) => {
      const fixture = await createCteBatchHttpFixture()

      const response = await fixture.handle(listCompanyItemsRequest({ search }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listCompanyItemCalls).toEqual([])
    },
  )

  test('requires cte.submit to read the CT-e listing', async () => {
    const fixture = await createCteBatchHttpFixture({
      permissions: MANAGE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(listCompanyItemsRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.listCompanyItemCalls).toEqual([])
  })

  test('propagates a safe failure without tenant leakage', async () => {
    const fixture = await createCteBatchHttpFixture({
      listCompanyItemsError: new ApiError({
        code: 'CTE_BATCH_NOT_FOUND',
        message: 'CT-e batch was not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(listCompanyItemsRequest())
    const responseBody = await response.clone().json()

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('CTE_BATCH_NOT_FOUND')
    expect(JSON.stringify(responseBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('documents the CT-e listing route explicitly', () => {
    expect(CTE_BATCH_ITEMS_PATH).toBe('/cte-batch-items')
  })
})
