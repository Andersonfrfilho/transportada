import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  CALCULATION_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  DOCUMENT_ID,
  EXPECTED_BATCH_SUMMARY,
  FINGERPRINT,
  IDEMPOTENCY_KEY,
  captureApiError,
  createCteBatchUseCaseForTest,
  CteBatchUnitOfWorkFixture,
} from './support.js'

describe('CT-e batch application create contract', () => {
  test('creates a tenant-scoped draft batch with immutable calculation snapshots', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const result = await useCase.create({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: 'Lote CT-e julho',
    })

    expect(result).toEqual(EXPECTED_BATCH_SUMMARY)
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.idempotencyQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    ])
    expect(unitOfWork.documentQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        documentId: DOCUMENT_ID,
      },
    ])
    expect(unitOfWork.freightQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        documentId: DOCUMENT_ID,
      },
    ])
    expect(unitOfWork.createdBatches).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        idempotencyFingerprint: FINGERPRINT,
        idempotencyKey: IDEMPOTENCY_KEY,
        name: 'Lote CT-e julho',
        operatorUserId: COMPANY_CONTEXT.userId,
        status: 'draft',
        version: '1',
      },
    ])
    expect(unitOfWork.createdItems).toEqual([
      {
        batchId: BATCH_ID,
        calculationSnapshot: {
          calculatedAmount: '350.0000',
          freightCalculationId: CALCULATION_ID,
          ruleSnapshot: {
            percentage: '0.035000',
            ruleVersion: '1',
            type: 'percentage_of_invoice_total',
          },
          totalAmount: '350.0000',
        },
        companyId: COMPANY_CONTEXT.companyId,
        freightCalculationId: CALCULATION_ID,
        nfeDocumentId: DOCUMENT_ID,
        position: '1',
      },
    ])
    expect(JSON.stringify(unitOfWork.createdItems)).not.toContain('xml')
    expect(unitOfWork.createdEvents).toContainEqual({
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'created',
      payload: {
        documentIds: [DOCUMENT_ID],
        itemCount: 1,
        status: 'draft',
      },
      userId: COMPANY_CONTEXT.userId,
    })
  })

  test('replays matching create idempotency without creating another partial batch', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.replayedCreate = {
      batch: EXPECTED_BATCH_SUMMARY,
      idempotencyFingerprint: FINGERPRINT,
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const result = await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: 'Lote CT-e julho',
    })

    expect(result).toEqual(EXPECTED_BATCH_SUMMARY)
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.createdBatches).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('rejects divergent create idempotency safely', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.replayedCreate = {
      batch: EXPECTED_BATCH_SUMMARY,
      idempotencyFingerprint: 'another-fingerprint',
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: 'Lote CT-e julho',
      }),
    )

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(FINGERPRINT)
    expect(unitOfWork.createdBatches).toEqual([])
  })

  test('rejects ineligible documents without creating a partial batch', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.document = {
      companyId: COMPANY_CONTEXT.companyId,
      id: DOCUMENT_ID,
      status: 'cancelled',
      variant: 'complete',
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: 'Lote CT-e julho',
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
      message: 'NF-e is not eligible for CT-e batch',
      status: 409,
    })
    expect(unitOfWork.createdBatches).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })
})
