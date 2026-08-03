/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  DUE_DATE,
  ELIGIBLE_CTE,
  IDEMPOTENCY_KEY,
  BillingUnitOfWorkFixture,
  captureApiError,
  createBillingUseCaseForTest,
} from './support.js'

const CUSTOMER = { document: '11222333000181', name: 'Cliente Alfa Ltda' } as const

/** `freight_calculations.total_amount` é numeric(19,4); as tabelas de faturamento são numeric(14,2). */
const SCALED_PREVIEW_RECORD = {
  batchId: 'cte-batch-001',
  companyId: COMPANY_CONTEXT.companyId,
  cteId: 'cte-a1',
  cteNumber: '1001',
  customerDocument: CUSTOMER.document,
  customerName: CUSTOMER.name,
  invoiceId: null,
  status: 'authorized',
  totalAmount: '43.1316',
} as const

describe('billing application money rounding contract', () => {
  test('preview soma CT-e de 4 casas arredondando cada item para centavos', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [
      { ...SCALED_PREVIEW_RECORD },
      { ...SCALED_PREVIEW_RECORD, cteId: 'cte-a2', cteNumber: '1002', totalAmount: '36.0486' },
      { ...SCALED_PREVIEW_RECORD, cteId: 'cte-a3', cteNumber: '1003', totalAmount: '32.3708' },
    ]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.preview({
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-a1', 'cte-a2', 'cte-a3'],
    })

    expect(result).toEqual({
      blocked: [],
      groups: [
        {
          cteCount: 3,
          cteIds: ['cte-a1', 'cte-a2', 'cte-a3'],
          customerDocument: CUSTOMER.document,
          customerName: CUSTOMER.name,
          totalAmount: '111.55',
        },
      ],
    })
  })

  test('arredonda meio para cima e nunca trunca a metade exata', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [
      { ...SCALED_PREVIEW_RECORD, totalAmount: '1.0050' },
      { ...SCALED_PREVIEW_RECORD, cteId: 'cte-a2', cteNumber: '1002', totalAmount: '2.0049' },
    ]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.preview({
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-a1', 'cte-a2'],
    })

    expect(result).toMatchObject({
      groups: [expect.objectContaining({ totalAmount: '3.01' })],
    })
  })

  test('create grava item e total da fatura em centavos, com total igual a soma dos itens', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.eligibleCtes = [
      {
        ...ELIGIBLE_CTE,
        freightAmount: '43.1316',
        snapshot: { ...ELIGIBLE_CTE.snapshot, totalAmount: '43.1316' },
        totalAmount: '43.1316',
      },
      {
        ...ELIGIBLE_CTE,
        batchItemId: 'cte-batch-item-002',
        cteNumber: '1002',
        freightAmount: '36.0486',
        id: 'cte-document-002',
        snapshot: { ...ELIGIBLE_CTE.snapshot, totalAmount: '36.0486' },
        totalAmount: '36.0486',
      },
    ]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      cteDocumentIds: ['cte-document-001', 'cte-document-002'],
      dueDate: DUE_DATE,
      idempotencyKey: IDEMPOTENCY_KEY,
    })

    expect(unitOfWork.createdInvoices).toMatchObject([
      { subtotalAmount: '79.18', totalAmount: '79.18' },
    ])
    expect(
      unitOfWork.createdItems.map((item) => ({
        freightAmount: item['freightAmount'],
        totalAmount: item['totalAmount'],
      })),
    ).toEqual([
      { freightAmount: '43.13', totalAmount: '43.13' },
      { freightAmount: '36.05', totalAmount: '36.05' },
    ])
  })

  test('continua recusando valor fora do formato numeric', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [{ ...SCALED_PREVIEW_RECORD, totalAmount: '43,13' }]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.preview({ context: COMPANY_CONTEXT, cteDocumentIds: ['cte-a1'] }),
    )

    expect(error.code).toBe('BILLING_INVOICE_INVALID_STATE')
    expect(error.status).toBe(409)
  })
})
