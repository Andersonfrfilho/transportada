import { describe, expect, test } from 'bun:test'

import type {
  CompanyCteItemPage,
  CompanyCteItemQuery,
  CompanyCteItemSummary,
  CompanyCteItemSummaryQuery,
  CteBatchItem,
  CteBatchItemQuery,
  CteBatchItemReaderPort,
} from '../../src/cte-batches/application/cte-batch-item.port.js'
import { createListCteBatchItemsUseCase } from '../../src/cte-batches/application/list-cte-batch-items.use-case.js'

import { BATCH_ID, COMPANY_CONTEXT, ITEM_ID, SECOND_ITEM_ID, captureApiError } from './support.js'

const GROUPED_ITEM: CteBatchItem = {
  accessKey: '35260705868574001090570010000000011000000012',
  authorizationProtocol: '135260000000123',
  authorizedAt: '2026-07-23T10:00:00.000Z',
  baseAmount: '30000.0000',
  billingInvoiceNumber: '17',
  billingInvoicedAt: '2026-07-20T12:00:00.000Z',
  billingStatus: 'invoiced',
  charges: [
    {
      amount: '1350.0000',
      baseAmount: '30000.0000',
      calculationType: 'percentage_of_cargo',
      label: 'Frete',
      ordinal: '1',
      rate: '0.045000',
    },
    {
      amount: '90.0000',
      baseAmount: '30000.0000',
      calculationType: 'percentage_of_cargo',
      label: 'GRIS',
      ordinal: '2',
      rate: '0.003000',
    },
  ],
  documents: [
    {
      accessKey: '35260705868574001090550020008526741408978623',
      id: 'nfe-document-001',
      number: '852674',
      position: '1',
      series: '2',
      totalAmount: '20000.0000',
    },
    {
      accessKey: '35260705868574001090550020008526741408978630',
      id: 'nfe-document-002',
      number: '852675',
      position: '2',
      series: '2',
      totalAmount: '10000.0000',
    },
  ],
  fiscalAmount: '1440.00',
  fiscalDocumentId: 'cte-fiscal-document-001',
  fiscalNumber: '17',
  fiscalNumberChange: null,
  fiscalSeries: '1',
  id: ITEM_ID,
  lastErrorCode: null,
  position: '1',
  status: 'authorized',
  totalAmount: '1440.0000',
}

const PENDING_ITEM: CteBatchItem = {
  accessKey: null,
  authorizationProtocol: null,
  authorizedAt: null,
  baseAmount: '5000.0000',
  billingInvoiceNumber: null,
  billingInvoicedAt: null,
  billingStatus: 'pending',
  charges: [],
  documents: [
    {
      accessKey: '35260705868574001090550020008526741408978647',
      id: 'nfe-document-003',
      number: '852676',
      position: '1',
      series: '2',
      totalAmount: '5000.0000',
    },
  ],
  fiscalAmount: '240.00',
  fiscalDocumentId: null,
  fiscalNumber: null,
  fiscalNumberChange: null,
  fiscalSeries: null,
  id: SECOND_ITEM_ID,
  lastErrorCode: null,
  position: '2',
  status: 'pending',
  totalAmount: '240.0000',
}

class CteBatchItemReaderFixture implements CteBatchItemReaderPort {
  public readonly batchQueries: CteBatchItemQuery[] = []
  public readonly companyQueries: CompanyCteItemQuery[] = []
  public readonly itemQueries: CteBatchItemQuery[] = []
  public readonly summaryQueries: CompanyCteItemSummaryQuery[] = []
  public batch: { readonly id: string } | null = { id: BATCH_ID }
  public items: readonly CteBatchItem[] = [GROUPED_ITEM, PENDING_ITEM]

  public async findBatch(query: CteBatchItemQuery): Promise<{ readonly id: string } | null> {
    this.batchQueries.push(query)
    return this.batch
  }

  public async listCompanyItems(query: CompanyCteItemQuery): Promise<CompanyCteItemPage> {
    this.companyQueries.push(query)
    return { items: [], nextCursor: null }
  }

  public async listItems(query: CteBatchItemQuery): Promise<readonly CteBatchItem[]> {
    this.itemQueries.push(query)
    return this.items
  }

  public async summarizeCompanyItems(
    query: CompanyCteItemSummaryQuery,
  ): Promise<CompanyCteItemSummary> {
    this.summaryQueries.push(query)
    return {
      baseAmount: '0.0000',
      batchIds: [],
      batchIdsTruncated: false,
      count: 0,
      statusCounts: {},
      totalAmount: '0.0000',
    }
  }
}

describe('CT-e batch item listing contract', () => {
  test('lists items with every linked note and the tenant from the authenticated context', async () => {
    const reader = new CteBatchItemReaderFixture()
    const useCase = createListCteBatchItemsUseCase({ reader })

    const result = await useCase.execute({ batchId: BATCH_ID, context: COMPANY_CONTEXT })

    expect(reader.itemQueries).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(result.items).toEqual([GROUPED_ITEM, PENDING_ITEM])
    expect(result.items[0]?.documents.map((document) => document.number)).toEqual([
      '852674',
      '852675',
    ])
  })

  test('exposes the fiscal key and protocol only for the already authorized item', async () => {
    const reader = new CteBatchItemReaderFixture()
    const useCase = createListCteBatchItemsUseCase({ reader })

    const result = await useCase.execute({ batchId: BATCH_ID, context: COMPANY_CONTEXT })

    expect(result.items[0]).toMatchObject({
      accessKey: '35260705868574001090570010000000011000000012',
      authorizationProtocol: '135260000000123',
      status: 'authorized',
      totalAmount: '1440.0000',
    })
    expect(result.items[1]).toMatchObject({
      accessKey: null,
      authorizationProtocol: null,
      status: 'pending',
    })
  })

  test('uses anti-enumeration for missing and cross-tenant batches without reading items', async () => {
    const reader = new CteBatchItemReaderFixture()
    reader.batch = null
    const useCase = createListCteBatchItemsUseCase({ reader })

    const error = await captureApiError(() =>
      useCase.execute({ batchId: BATCH_ID, context: COMPANY_CONTEXT }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_NOT_FOUND',
      message: 'CT-e batch was not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(BATCH_ID)
    expect(reader.batchQueries).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(reader.itemQueries).toEqual([])
  })
})
