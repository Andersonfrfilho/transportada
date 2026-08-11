import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  EXPECTED_INVOICE,
  INVOICE_ID,
  BillingUnitOfWorkFixture,
  captureApiError,
  createBillingUseCaseForTest,
} from './support.js'

describe('billing application cancel and lookup contract', () => {
  test('uses authenticated tenant scope for invoice detail', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.get({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      invoiceId: INVOICE_ID,
    })

    expect(result).toEqual(EXPECTED_INVOICE)
    expect(unitOfWork.invoiceQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        invoiceId: INVOICE_ID,
      },
    ])
  })

  test('returns the same safe absence for missing and cross-tenant invoices', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.invoice = null
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.get({
        context: COMPANY_CONTEXT,
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'BILLING_INVOICE_NOT_FOUND',
      message: 'Billing invoice was not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(INVOICE_ID)
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('cancels an issued invoice and appends a sanitized audit event', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.cancel({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      invoiceId: INVOICE_ID,
      reason: '  Duplicidade operacional \n',
    })

    expect(result).toEqual({
      ...EXPECTED_INVOICE,
      status: 'cancelled',
    })
    expect(unitOfWork.executedTransactions).toEqual(['billing'])
    expect(unitOfWork.cancellationUpdates).toEqual([
      {
        cancelledAt: '2026-07-23T15:00:00.000Z',
        companyId: COMPANY_CONTEXT.companyId,
        expectedStatus: 'issued',
        invoiceId: INVOICE_ID,
        nextStatus: 'cancelled',
      },
    ])
    expect(unitOfWork.itemReleases).toEqual([
      {
        cancelledAt: '2026-07-23T15:00:00.000Z',
        companyId: COMPANY_CONTEXT.companyId,
        invoiceId: INVOICE_ID,
      },
    ])
    expect(unitOfWork.createdEvents).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        eventName: 'invoice_cancelled',
        invoiceId: INVOICE_ID,
        payload: {
          correlationId: CORRELATION_ID,
          previousStatus: 'issued',
          status: 'cancelled',
        },
        reason: 'Duplicidade operacional',
      },
    ])
  })

  test('replays cancellation of an already cancelled invoice without another event', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.invoice = {
      ...EXPECTED_INVOICE,
      status: 'cancelled',
    }
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.cancel({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      invoiceId: INVOICE_ID,
      reason: 'Duplicidade operacional',
    })

    expect(result).toEqual(unitOfWork.invoice)
    expect(unitOfWork.cancellationUpdates).toEqual([])
    expect(unitOfWork.itemReleases).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })
})
