import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CTE_DOCUMENT_ID,
  DUE_DATE,
  ELIGIBLE_CTE,
  EXPECTED_INVOICE,
  FINGERPRINT,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  BillingUnitOfWorkFixture,
  captureApiError,
  createBillingUseCaseForTest,
} from './support.js'

const CREATE_INPUT = {
  companyId: 'attacker-company',
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  cteDocumentIds: [CTE_DOCUMENT_ID],
  dueDate: DUE_DATE,
  idempotencyKey: IDEMPOTENCY_KEY,
} as const

describe('billing application create contract', () => {
  test('creates an immutable invoice and decimal item snapshots in one transaction', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.create(CREATE_INPUT)

    expect(result).toEqual(EXPECTED_INVOICE)
    expect(unitOfWork.executedTransactions).toEqual(['billing'])
    expect(unitOfWork.idempotencyQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ])
    expect(unitOfWork.eligibilityQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cteDocumentIds: [CTE_DOCUMENT_ID],
        excludeActiveInvoice: true,
        status: 'authorized',
      },
    ])
    expect(unitOfWork.reservations).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cteDocumentIds: [CTE_DOCUMENT_ID],
      },
    ])
    expect(unitOfWork.createdInvoices).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        currency: 'BRL',
        customerDocument: ELIGIBLE_CTE.customerDocument,
        customerName: ELIGIBLE_CTE.customerName,
        discountAmount: '0.00',
        dueDate: DUE_DATE,
        idempotencyKey: IDEMPOTENCY_KEY,
        issueDate: '2026-07-23T15:00:00.000Z',
        requestFingerprint: FINGERPRINT,
        status: 'issued',
        subtotalAmount: '350.00',
        surchargeAmount: '0.00',
        totalAmount: '350.00',
      },
    ])
    expect(unitOfWork.createdItems).toEqual([
      {
        batchId: ELIGIBLE_CTE.batchId,
        batchItemId: ELIGIBLE_CTE.batchItemId,
        companyId: COMPANY_CONTEXT.companyId,
        cteAccessKey: ELIGIBLE_CTE.accessKey,
        cteDocumentId: CTE_DOCUMENT_ID,
        cteNumber: ELIGIBLE_CTE.cteNumber,
        description: 'Frete CT-e 1001',
        freightAmount: '350.00',
        invoiceId: INVOICE_ID,
        lineNumber: '1',
        snapshot: ELIGIBLE_CTE.snapshot,
        totalAmount: '350.00',
      },
    ])
    expect(unitOfWork.createdEvents).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        eventName: 'invoice_created',
        invoiceId: INVOICE_ID,
        payload: {
          itemCount: 1,
          totalAmount: '350.00',
        },
      },
    ])
    expect(JSON.stringify(unitOfWork.createdInvoices)).not.toContain('attacker-company')
    expect(JSON.stringify(unitOfWork.createdItems)).not.toContain('xml')
  })

  test('bills a large selection of the same customer as a single invoice', async () => {
    const CTE_COUNT = 250
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.eligibleCtes = Array.from({ length: CTE_COUNT }, (_unused, index) => ({
      ...ELIGIBLE_CTE,
      cteNumber: String(2000 + index),
      id: `cte-document-${String(index + 1).padStart(4, '0')}`,
    }))
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    await useCase.create({
      ...CREATE_INPUT,
      cteDocumentIds: unitOfWork.eligibleCtes.map((cte) => cte.id as string),
    })

    /** O tomador tem uma dívida só: dividir a seleção criaria duas cobranças para o mesmo período. */
    expect(unitOfWork.createdInvoices).toHaveLength(1)
    expect(unitOfWork.createdInvoices[0]).toMatchObject({
      subtotalAmount: '87500.00',
      totalAmount: '87500.00',
    })
    expect(unitOfWork.createdItems).toHaveLength(CTE_COUNT)
    /** Reserva e gravação vão em bloco: por CT-e seriam centenas de idas ao banco na transação. */
    expect(unitOfWork.reservations).toHaveLength(1)
    expect(unitOfWork.itemWrites).toEqual([CTE_COUNT])
    expect(unitOfWork.createdEvents).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        eventName: 'invoice_created',
        invoiceId: INVOICE_ID,
        payload: {
          itemCount: CTE_COUNT,
          totalAmount: '87500.00',
        },
      },
    ])
  })

  test('replays matching idempotency without creating another invoice', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.replayedCreate = {
      invoice: EXPECTED_INVOICE,
      requestFingerprint: FINGERPRINT,
    }
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.create(CREATE_INPUT)

    expect(result).toEqual(EXPECTED_INVOICE)
    expect(unitOfWork.createdInvoices).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
    expect(unitOfWork.reservations).toEqual([])
  })

  test('rejects divergent idempotency without exposing tenant or fingerprints', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.replayedCreate = {
      invoice: EXPECTED_INVOICE,
      requestFingerprint: 'different-fingerprint',
    }
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.create(CREATE_INPUT))

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(FINGERPRINT)
    expect(unitOfWork.createdInvoices).toEqual([])
  })

  test('rejects an ineligible CT-e without leaving a partial invoice', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.eligibleCtes = []
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.create(CREATE_INPUT))

    expect(error).toMatchObject({
      code: 'BILLING_CTE_NOT_ELIGIBLE',
      message: 'CT-e is not eligible for billing',
      status: 409,
    })
    expect(unitOfWork.createdInvoices).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('rolls back when concurrent users reserve the same CT-e', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.concurrentReservationAllowed = false
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.create(CREATE_INPUT))

    expect(error).toMatchObject({
      code: 'BILLING_CTE_ALREADY_INVOICED',
      message: 'CT-e already belongs to an active invoice',
      status: 409,
    })
    expect(unitOfWork.executedTransactions).toEqual(['billing'])
    expect(unitOfWork.createdInvoices).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
    expect(unitOfWork.reservations).toEqual([])
  })
})
