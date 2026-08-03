/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_ELIGIBLE_CTES_PATH,
  COMPANY_CONTEXT,
  createBillingHttpFixture,
  listEligibleCtesRequest,
  responseApiError,
} from '../fixtures/billing-http.fixture.js'

const BATCH_ID_PRIMARY = '00000000-0000-4000-8000-000000000713'
const BATCH_ID_SECONDARY = '00000000-0000-4000-8000-000000000714'
const ELIGIBLE_LIST_MAX_VALUES = 100

function batchIdAt(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function repeatedBatchIds(total: number): string {
  return Array.from({ length: total }, (_, index) => batchIdAt(index + 1)).join(',')
}

function repeatedFiscalNumbers(total: number): string {
  return Array.from({ length: total }, (_, index) => String(index + 1)).join(',')
}

describe('Billing HTTP eligible CT-e filters contract', () => {
  test('forwards the list filters and the customer name search to the application', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest(
        `?cteNumberIn=123456,123457&batchIdIn=${BATCH_ID_PRIMARY},${BATCH_ID_SECONDARY}&customerName=Sul&limit=25`,
      ),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls).toEqual([
      {
        batchIdIn: [BATCH_ID_PRIMARY, BATCH_ID_SECONDARY],
        context: COMPANY_CONTEXT,
        cteNumberIn: ['123456', '123457'],
        cursor: null,
        customerName: 'Sul',
        limit: 25,
      },
    ])
  })

  test('trims the customer name and keeps a single value list intact', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest(`?customerName=${encodeURIComponent('  Sul  ')}&cteNumberIn=123456`),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.customerName).toBe('Sul')
    expect(fixture.listEligibleCalls[0]?.cteNumberIn).toEqual(['123456'])
  })

  test('accepts a list at the maximum size', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest(`?batchIdIn=${repeatedBatchIds(ELIGIBLE_LIST_MAX_VALUES)}`),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.batchIdIn).toHaveLength(ELIGIBLE_LIST_MAX_VALUES)
  })

  test('refuses every malformed filter before reaching the application', async () => {
    /** Cada consulta prova uma recusa distinta; nenhuma pode chegar ao caso de uso. */
    for (const query of [
      '?unknownFilter=1',
      '?customerName=Sul&customerName=Norte',
      '?cteNumberIn=123456&cteNumberIn=123457',
      '?cteNumberIn=',
      '?batchIdIn=',
      '?customerName=S',
      `?customerName=${encodeURIComponent('  a ')}`,
      '?cteNumberIn=123456,abc',
      '?cteNumberIn=123456,,123457',
      `?batchIdIn=${BATCH_ID_PRIMARY},not-a-uuid`,
      `?batchIdIn=${repeatedBatchIds(ELIGIBLE_LIST_MAX_VALUES + 1)}`,
      '?cteNumber=123456&cteNumberIn=123457',
      `?batchId=${BATCH_ID_PRIMARY}&batchIdIn=${BATCH_ID_SECONDARY}`,
    ]) {
      const fixture = await createBillingHttpFixture()

      const response = await fixture.handle(listEligibleCtesRequest(query))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listEligibleCalls).toEqual([])
    }
  })

  test('forwards a CT-e number range on its own', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest('?cteNumberFrom=10&cteNumberTo=40'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.cteNumberFrom).toBe('10')
    expect(fixture.listEligibleCalls[0]?.cteNumberTo).toBe('40')
  })

  /** Lista e faixa são alternativas do mesmo domínio: a rota repassa as duas para o `or` da query. */
  test('forwards a list and a range together', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest('?cteNumberIn=3,7&cteNumberFrom=10&cteNumberTo=40'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.cteNumberIn).toEqual(['3', '7'])
    expect(fixture.listEligibleCalls[0]?.cteNumberFrom).toBe('10')
    expect(fixture.listEligibleCalls[0]?.cteNumberTo).toBe('40')
  })

  test('accepts the boundaries of the range: equal ends and the widest number', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest('?cteNumberFrom=1&cteNumberTo=999999999'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.cteNumberFrom).toBe('1')
    expect(fixture.listEligibleCalls[0]?.cteNumberTo).toBe('999999999')
  })

  test('refuses every malformed CT-e number range before reaching the application', async () => {
    /** Faixa pela metade ou invertida é 400, nunca meia-verdade aplicada em silêncio. */
    for (const query of [
      '?cteNumberFrom=10',
      '?cteNumberTo=40',
      '?cteNumberFrom=40&cteNumberTo=10',
      '?cteNumberFrom=abc&cteNumberTo=40',
      '?cteNumberFrom=10&cteNumberTo=1234567890',
      '?cteNumberFrom=&cteNumberTo=40',
      '?cteNumberFrom=10&cteNumberFrom=11&cteNumberTo=40',
      '?cteNumber=123456&cteNumberFrom=10&cteNumberTo=40',
    ]) {
      const fixture = await createBillingHttpFixture()

      const response = await fixture.handle(listEligibleCtesRequest(query))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listEligibleCalls).toEqual([])
    }
  })

  test('forwards the note number list and range of the linked NF-e', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest('?nfeNumberIn=3,7&nfeNumberFrom=10&nfeNumberTo=40'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.nfeNumberIn).toEqual(['3', '7'])
    expect(fixture.listEligibleCalls[0]?.nfeNumberFrom).toBe('10')
    expect(fixture.listEligibleCalls[0]?.nfeNumberTo).toBe('40')
  })

  test('forwards a note number list on its own', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(listEligibleCtesRequest('?nfeNumberIn=123456'))

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]?.nfeNumberIn).toEqual(['123456'])
    expect(fixture.listEligibleCalls[0]?.nfeNumberFrom).toBeUndefined()
  })

  test('refuses every malformed note number filter before reaching the application', async () => {
    /** `nNF` também tem 9 dígitos: as recusas são as mesmas do número de CT-e. */
    for (const query of [
      '?nfeNumberFrom=10',
      '?nfeNumberTo=40',
      '?nfeNumberFrom=40&nfeNumberTo=10',
      '?nfeNumberFrom=abc&nfeNumberTo=40',
      '?nfeNumberFrom=10&nfeNumberTo=1234567890',
      '?nfeNumberIn=',
      '?nfeNumberIn=123456,abc',
      '?nfeNumberIn=123456,,123457',
      '?nfeNumberIn=0',
      '?nfeNumberIn=123456&nfeNumberIn=123457',
      `?nfeNumberIn=${repeatedFiscalNumbers(ELIGIBLE_LIST_MAX_VALUES + 1)}`,
    ]) {
      const fixture = await createBillingHttpFixture()

      const response = await fixture.handle(listEligibleCtesRequest(query))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listEligibleCalls).toEqual([])
    }
  })

  test('keeps the filters that already existed working alone', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listEligibleCtesRequest(
        `?batchId=${BATCH_ID_PRIMARY}&cteNumber=123456&issuedFrom=2026-07-01&issuedTo=2026-07-31&minAmount=100.00&maxAmount=350.50&limit=25`,
      ),
    )

    expect(response.status).toBe(200)
    expect(fixture.listEligibleCalls[0]).toEqual({
      batchId: BATCH_ID_PRIMARY,
      context: COMPANY_CONTEXT,
      cteNumber: '123456',
      cursor: null,
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
      limit: 25,
      maxAmount: '350.50',
      minAmount: '100.00',
    })
    expect(BILLING_ELIGIBLE_CTES_PATH).toBe('/billing/eligible-ctes')
  })
})
