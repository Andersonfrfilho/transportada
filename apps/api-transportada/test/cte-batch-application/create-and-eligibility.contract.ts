import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_NAME,
  CALCULATION_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  DOCUMENT_ID,
  ELIGIBLE_DOCUMENT,
  EXPECTED_BATCH_SUMMARY,
  FINGERPRINT,
  IDEMPOTENCY_KEY,
  ITEM_ID,
  SECOND_CALCULATION_ID,
  SECOND_DOCUMENT_ID,
  SECOND_ITEM_ID,
  THIRD_DOCUMENT_ID,
  captureApiError,
  createCteBatchUseCaseForTest,
  CteBatchFingerprintFixture,
  CteBatchUnitOfWorkFixture,
  decodeFingerprintFields,
} from './support.js'

const BULK_DOCUMENT_COUNT = 250
const APPEND_IDEMPOTENCY_KEY = 'cte-batch-append-idempotency-001'

function registerBulkDocuments(unitOfWork: CteBatchUnitOfWorkFixture): readonly string[] {
  return Array.from({ length: BULK_DOCUMENT_COUNT }, (_unused, index) => {
    const ordinal = String(index + 1).padStart(6, '0')
    const documentId = `nfe-document-bulk-${ordinal}`
    unitOfWork.documentsById.set(documentId, {
      ...ELIGIBLE_DOCUMENT,
      accessKey: `3526070000000000000055001${ordinal}1000000010`,
      id: documentId,
      number: String(index + 1),
    })

    return documentId
  })
}

describe('CT-e batch application create contract', () => {
  test('creates one item per selected document with frozen snapshots and charges', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const fingerprintService = new CteBatchFingerprintFixture(FINGERPRINT)
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, fingerprintService)

    const result = await useCase.create({
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(result).toEqual({ ...EXPECTED_BATCH_SUMMARY, itemCount: 2 })
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.idempotencyQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, idempotencyKey: IDEMPOTENCY_KEY },
    ])
    expect(unitOfWork.documentQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID] },
    ])
    expect(unitOfWork.activeLinkQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID] },
    ])
    expect(unitOfWork.createdBatches).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        idempotencyFingerprint: FINGERPRINT,
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
        operatorUserId: COMPANY_CONTEXT.userId,
        status: 'draft',
        version: '1',
      },
    ])
    expect(unitOfWork.createdItems.map((item) => item['position'])).toEqual(['1', '2'])
    expect(unitOfWork.createdItems.map((item) => item['nfeDocumentId'])).toEqual([
      DOCUMENT_ID,
      SECOND_DOCUMENT_ID,
    ])
    expect(unitOfWork.createdItems.map((item) => item['freightCalculationId'])).toEqual([
      CALCULATION_ID,
      SECOND_CALCULATION_ID,
    ])
    expect(unitOfWork.createdItems[0]).toMatchObject({
      batchId: BATCH_ID,
      calculationSnapshot: {
        baseAmount: '10000.0000',
        calculatedAmount: '450.0000',
        fiscalAmount: '450.00',
        freightCalculationId: CALCULATION_ID,
        percentage: '0.045000',
      },
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(JSON.stringify(unitOfWork.createdItems)).not.toContain('xml')
    expect(unitOfWork.createdEvents).toContainEqual({
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'created',
      payload: {
        documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
        itemCount: 2,
        status: 'draft',
      },
      userId: COMPANY_CONTEXT.userId,
    })
    expect(decodeFingerprintFields(fingerprintService.payloads[0])).toEqual([
      COMPANY_CONTEXT.companyId,
      BATCH_NAME,
      '',
      '',
      DOCUMENT_ID,
      SECOND_DOCUMENT_ID,
    ])
  })

  test('creates a batch with a selection far beyond the old hundred-document ceiling', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const documentIds = registerBulkDocuments(unitOfWork)
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const result = await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds,
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(result).toEqual({ ...EXPECTED_BATCH_SUMMARY, itemCount: BULK_DOCUMENT_COUNT })
    expect(unitOfWork.createdItems).toHaveLength(BULK_DOCUMENT_COUNT)
    expect(unitOfWork.createdItemDocuments).toHaveLength(BULK_DOCUMENT_COUNT)
  })

  test('binds every document to its projected CT-e item and freezes the charge breakdown', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.createdItemDocuments).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        nfeDocumentId: DOCUMENT_ID,
        position: '1',
      },
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        itemId: SECOND_ITEM_ID,
        nfeDocumentId: SECOND_DOCUMENT_ID,
        position: '1',
      },
    ])
    expect(unitOfWork.createdItemCharges).toEqual([
      {
        amount: '450.0000',
        baseAmount: '10000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        label: 'Frete',
        ordinal: '1',
        rate: '0.045000',
      },
      {
        amount: '900.0000',
        baseAmount: '20000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: SECOND_ITEM_ID,
        label: 'Frete',
        ordinal: '1',
        rate: '0.045000',
      },
    ])
  })

  test('appends a later slice to the same batch, continuing the item positions', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.batch = { ...EXPECTED_BATCH_SUMMARY, itemCount: 2 }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const result = await useCase.appendItems({
      batchId: BATCH_ID,
      companyId: 'attacker-company',
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [THIRD_DOCUMENT_ID],
      idempotencyKey: APPEND_IDEMPOTENCY_KEY,
    })

    expect(result).toMatchObject({ id: BATCH_ID, itemCount: 3 })
    expect(unitOfWork.createdBatches).toEqual([])
    expect(unitOfWork.touchedBatches).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        expectedStatus: 'draft',
      },
    ])
    expect(unitOfWork.createdItems.map((item) => item['position'])).toEqual(['3'])
    expect(unitOfWork.createdItems.map((item) => item['nfeDocumentId'])).toEqual([
      THIRD_DOCUMENT_ID,
    ])
    expect(unitOfWork.createdEvents).toContainEqual({
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'items_appended',
      payload: {
        documentIds: [THIRD_DOCUMENT_ID],
        itemCount: 3,
        status: 'draft',
      },
      userId: COMPANY_CONTEXT.userId,
    })
  })

  test('refuses to append to a batch that already left the draft state', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.batch = { ...EXPECTED_BATCH_SUMMARY, status: 'submitted' }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.appendItems({
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [THIRD_DOCUMENT_ID],
        idempotencyKey: APPEND_IDEMPOTENCY_KEY,
      }),
    )

    expect(error).toMatchObject({ code: 'CTE_BATCH_INVALID_STATE', status: 409 })
    expect(unitOfWork.createdItems).toEqual([])
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
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(result).toEqual(EXPECTED_BATCH_SUMMARY)
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.createdBatches).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.createdItemDocuments).toEqual([])
    expect(unitOfWork.createdItemCharges).toEqual([])
    expect(unitOfWork.createdFreightCalculations).toEqual([])
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
        name: BATCH_NAME,
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
})
