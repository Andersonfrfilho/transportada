import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_NAME,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  DOCUMENT_ID,
  ELIGIBLE_DOCUMENT,
  IDEMPOTENCY_KEY,
  SECOND_DOCUMENT_ID,
  captureApiError,
  createCteBatchUseCaseForTest,
  CteBatchUnitOfWorkFixture,
} from './support.js'

const NFSE_INVOICE_ID = '00000000-0000-4000-8000-0000000009f2'

function expectNothingPersisted(unitOfWork: CteBatchUnitOfWorkFixture): void {
  expect(unitOfWork.createdBatches).toEqual([])
  expect(unitOfWork.createdItems).toEqual([])
  expect(unitOfWork.createdItemDocuments).toEqual([])
  expect(unitOfWork.createdItemCharges).toEqual([])
  expect(unitOfWork.createdFreightCalculations).toEqual([])
  expect(unitOfWork.createdEvents).toEqual([])
}

describe('CT-e batch document blocking contract', () => {
  test('rejects ineligible documents without creating a partial batch', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.document = { ...ELIGIBLE_DOCUMENT, status: 'cancelled' }
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
      code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
      message: 'NF-e is not eligible for CT-e batch',
      status: 409,
    })
    expectNothingPersisted(unitOfWork)
  })

  /** Bitributar o mesmo transporte é erro de negócio, e o operador precisa ler por que foi barrado. */
  test('hard-blocks a document already linked to a live municipal service invoice', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.activeNfseLinks.set(SECOND_DOCUMENT_ID, NFSE_INVOICE_ID)
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_LINKED_TO_NFSE',
      message: 'NF-e is already linked to a municipal service invoice',
      status: 409,
    })
    expectNothingPersisted(unitOfWork)
  })

  test('hard-blocks a document already linked to a CT-e batch that was not cancelled', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.activeLinks.set(SECOND_DOCUMENT_ID, BATCH_ID)
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      message: 'NF-e is already linked to an active CT-e',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expectNothingPersisted(unitOfWork)
  })

  test('rejects the same document selected twice in one batch', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [DOCUMENT_ID, DOCUMENT_ID],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      message: 'NF-e is already linked to an active CT-e',
      status: 409,
    })
    expectNothingPersisted(unitOfWork)
  })

  test('rejects a selection above the supported document limit', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: Array.from({ length: 101 }, (_value, index) => `nfe-document-${index}`),
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
      status: 409,
    })
    expectNothingPersisted(unitOfWork)
  })

  test('rejects an empty selection', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.create({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        documentIds: [],
        idempotencyKey: IDEMPOTENCY_KEY,
        name: BATCH_NAME,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
      status: 409,
    })
    expectNothingPersisted(unitOfWork)
  })
})
