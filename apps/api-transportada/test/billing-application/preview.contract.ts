/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  BillingUnitOfWorkFixture,
  createBillingUseCaseForTest,
} from './support.js'

const CUSTOMER_A = { document: '11222333000181', name: 'Cliente Alfa Ltda' } as const
const CUSTOMER_B = { document: '44555666000172', name: 'Cliente Beta Ltda' } as const

const AUTHORIZED_A1 = {
  batchId: 'cte-batch-001',
  companyId: COMPANY_CONTEXT.companyId,
  cteId: 'cte-a1',
  cteNumber: '1001',
  customerDocument: CUSTOMER_A.document,
  customerName: CUSTOMER_A.name,
  invoiceId: null,
  status: 'authorized',
  totalAmount: '350.00',
} as const

const AUTHORIZED_A2 = {
  ...AUTHORIZED_A1,
  cteId: 'cte-a2',
  cteNumber: '1002',
  totalAmount: '1249.99',
} as const

const AUTHORIZED_B1 = {
  ...AUTHORIZED_A1,
  cteId: 'cte-b1',
  cteNumber: '1003',
  customerDocument: CUSTOMER_B.document,
  customerName: CUSTOMER_B.name,
  totalAmount: '10.01',
} as const

describe('billing application preview contract', () => {
  test('groups billable CT-e by customer keeping the requested order and decimal sums', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [{ ...AUTHORIZED_B1 }, { ...AUTHORIZED_A1 }, { ...AUTHORIZED_A2 }]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.preview({
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-a1', 'cte-b1', 'cte-a2'],
    })

    expect(result).toEqual({
      blocked: [],
      groups: [
        {
          cteCount: 2,
          cteIds: ['cte-a1', 'cte-a2'],
          customerDocument: CUSTOMER_A.document,
          customerName: CUSTOMER_A.name,
          totalAmount: '1599.99',
        },
        {
          cteCount: 1,
          cteIds: ['cte-b1'],
          customerDocument: CUSTOMER_B.document,
          customerName: CUSTOMER_B.name,
          totalAmount: '10.01',
        },
      ],
    })
  })

  test('reads the tenant from the authenticated context and never from the payload', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [{ ...AUTHORIZED_A1 }]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    await useCase.preview({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-a1', 'cte-a1'],
    })

    expect(unitOfWork.previewQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, cteDocumentIds: ['cte-a1'] },
    ])
  })

  test('blocks each non billable CT-e with a stable reason, in the requested order', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = [
      { ...AUTHORIZED_A1, cteId: 'cte-pending', status: 'pending' },
      { ...AUTHORIZED_A1, cteId: 'cte-invoiced', invoiceId: 'billing-invoice-001' },
      { ...AUTHORIZED_A1, cteId: 'cte-no-customer', customerDocument: null, customerName: null },
      { ...AUTHORIZED_A1 },
    ]
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.preview({
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-missing', 'cte-pending', 'cte-invoiced', 'cte-no-customer', 'cte-a1'],
    })

    expect(result).toEqual({
      blocked: [
        { cteId: 'cte-missing', reason: 'not_found' },
        { cteId: 'cte-pending', reason: 'not_authorized' },
        { cteId: 'cte-invoiced', reason: 'already_invoiced' },
        { cteId: 'cte-no-customer', reason: 'missing_customer' },
      ],
      groups: [
        {
          cteCount: 1,
          cteIds: ['cte-a1'],
          customerDocument: CUSTOMER_A.document,
          customerName: CUSTOMER_A.name,
          totalAmount: '350.00',
        },
      ],
    })
  })

  test('returns no group when the repository answers nothing for the tenant', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.previewRecords = []
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.preview({
      context: COMPANY_CONTEXT,
      cteDocumentIds: ['cte-from-another-company'],
    })

    expect(result).toEqual({
      blocked: [{ cteId: 'cte-from-another-company', reason: 'not_found' }],
      groups: [],
    })
    expect(unitOfWork.createdInvoices).toEqual([])
  })
})
