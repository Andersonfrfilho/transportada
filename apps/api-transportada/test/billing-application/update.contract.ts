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

const OBSERVATIONS = 'Desconto comercial negociado'

describe('billing application invoice update contract', () => {
  test('recalculates the total from the stored subtotal and persists inside the tenant scope', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.update({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      discountAmount: '50.00',
      invoiceId: INVOICE_ID,
      observations: '  Desconto comercial \n negociado ',
      surchargeAmount: '10.25',
    })

    expect(result).toEqual({
      ...EXPECTED_INVOICE,
      discountAmount: '50.00',
      observations: OBSERVATIONS,
      surchargeAmount: '10.25',
      totalAmount: '310.25',
    })
    expect(unitOfWork.executedTransactions).toEqual(['billing'])
    expect(unitOfWork.invoiceQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, invoiceId: INVOICE_ID },
    ])
    expect(unitOfWork.detailUpdates).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        discountAmount: '50.00',
        expectedStatus: 'issued',
        invoiceId: INVOICE_ID,
        observations: OBSERVATIONS,
        surchargeAmount: '10.25',
        totalAmount: '310.25',
      },
    ])
  })

  test('appends an audit event with the amounts and without the free observations text', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      discountAmount: '50.00',
      invoiceId: INVOICE_ID,
      observations: OBSERVATIONS,
      surchargeAmount: '10.25',
    })

    expect(unitOfWork.createdEvents).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        eventName: 'invoice_updated',
        invoiceId: INVOICE_ID,
        payload: {
          correlationId: CORRELATION_ID,
          discountAmount: '50.00',
          observationsChanged: true,
          previousDiscountAmount: '0.00',
          previousSurchargeAmount: '0.00',
          previousTotalAmount: '350.00',
          surchargeAmount: '10.25',
          totalAmount: '310.25',
        },
      },
    ])
    /** Observação é texto livre do operador: a trilha guarda que mudou, nunca o conteúdo. */
    expect(JSON.stringify(unitOfWork.createdEvents)).not.toContain(OBSERVATIONS)
  })

  test('keeps the untouched amounts when only one field is edited', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      invoiceId: INVOICE_ID,
      observations: OBSERVATIONS,
    })

    expect(result).toMatchObject({
      discountAmount: '0.00',
      observations: OBSERVATIONS,
      surchargeAmount: '0.00',
      totalAmount: '350.00',
    })
    expect(unitOfWork.detailUpdates).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        discountAmount: '0.00',
        expectedStatus: 'issued',
        invoiceId: INVOICE_ID,
        observations: OBSERVATIONS,
        surchargeAmount: '0.00',
        totalAmount: '350.00',
      },
    ])
    expect(unitOfWork.createdEvents[0]).toMatchObject({
      payload: { observationsChanged: true },
    })
  })

  test('clears the observations when an empty text is sent', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.invoice = { ...EXPECTED_INVOICE, observations: OBSERVATIONS }
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      invoiceId: INVOICE_ID,
      observations: '   ',
    })

    expect(result).toMatchObject({ observations: '' })
    expect(unitOfWork.detailUpdates[0]).toMatchObject({ observations: '' })
  })

  test('refuses a discount above the subtotal without touching the invoice', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.update({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        discountAmount: '350.01',
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'BILLING_INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL',
      status: 422,
    })
    expect(JSON.stringify(error)).not.toContain(INVOICE_ID)
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(unitOfWork.detailUpdates).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('accepts a discount that zeroes the total', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const result = await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      discountAmount: '350.00',
      invoiceId: INVOICE_ID,
    })

    expect(result).toMatchObject({ totalAmount: '0.00' })
  })

  test('refuses to edit a cancelled invoice', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.invoice = { ...EXPECTED_INVOICE, status: 'cancelled' }
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.update({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        discountAmount: '10.00',
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'BILLING_INVOICE_INVALID_STATE',
      status: 409,
    })
    expect(unitOfWork.detailUpdates).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('returns the same safe absence for missing and cross-tenant invoices', async () => {
    const unitOfWork = new BillingUnitOfWorkFixture()
    unitOfWork.invoice = null
    const useCase = await createBillingUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.update({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        invoiceId: INVOICE_ID,
        observations: OBSERVATIONS,
      }),
    )

    expect(error).toMatchObject({
      code: 'BILLING_INVOICE_NOT_FOUND',
      status: 404,
    })
    expect(unitOfWork.detailUpdates).toEqual([])
  })
})
