import { describe, expect, test } from 'bun:test'

import {
  PREVIEW_CONTEXT,
  REFERENCE_DOCUMENT_ID,
  SECOND_DOCUMENT_ID,
  CteBatchPreviewReaderFixture,
  createPreviewUseCaseForTest,
} from './preview-support.js'
import {
  BATCH_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  EXPECTED_BATCH_SUMMARY,
  ITEM_ID,
  SECOND_ITEM_ID,
  CteBatchUnitOfWorkFixture,
  captureApiError,
  createCteBatchUseCaseForTest,
} from './support.js'

const REMOVAL_INPUT = {
  batchId: BATCH_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  itemId: ITEM_ID,
} as const

describe('CT-e batch draft item removal', () => {
  test('removes the item and gives its notes back to the selection', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const batch = await useCase.removeItem({ ...REMOVAL_INPUT })

    expect(batch).toEqual({ ...EXPECTED_BATCH_SUMMARY, itemCount: 0, version: '2' })
    expect(unitOfWork.itemQueries).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId, itemId: ITEM_ID },
    ])
    expect(unitOfWork.deletedItems).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId, itemId: ITEM_ID },
    ])
    expect([...unitOfWork.activeLinks.keys()]).toEqual([])
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
  })

  test('locks the draft batch before deleting anything', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    await useCase.removeItem({ ...REMOVAL_INPUT })

    expect(unitOfWork.touchedBatches).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId, expectedStatus: 'draft' },
    ])
    expect(unitOfWork.statusChanges).toEqual([])
  })

  test('records an updated event carrying the freed notes', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    await useCase.removeItem({ ...REMOVAL_INPUT })

    expect(unitOfWork.createdEvents).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        eventName: 'updated',
        payload: {
          documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
          itemId: ITEM_ID,
          operation: 'item_removed',
          status: 'draft',
        },
        userId: COMPANY_CONTEXT.userId,
      },
    ])
  })

  test('turns the freed notes eligible again in the preview', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    const preview = await createPreviewUseCaseForTest({
      reader: new CteBatchPreviewReaderFixture(undefined, unitOfWork.activeLinks),
    })
    const documentIds = [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID]

    const before = await preview.execute({ context: PREVIEW_CONTEXT, documentIds })
    expect(before.blocked).toEqual([
      {
        batchId: BATCH_ID,
        documentId: REFERENCE_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      },
      {
        batchId: BATCH_ID,
        documentId: SECOND_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      },
    ])

    const useCase = await createCteBatchUseCaseForTest(unitOfWork)
    await useCase.removeItem({ ...REMOVAL_INPUT })

    const after = await preview.execute({ context: PREVIEW_CONTEXT, documentIds })
    expect(after.blocked).toEqual([])
    expect(after.projections).toHaveLength(2)
    expect(after.summary.projectedCount).toBe(2)
  })

  test('refuses to remove an item after the batch is submitted', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    unitOfWork.batch = { ...EXPECTED_BATCH_SUMMARY, status: 'submitted' }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.removeItem({ ...REMOVAL_INPUT }))

    expect(error.status).toBe(409)
    expect(error.code).toBe('CTE_BATCH_INVALID_STATE')
    expect(unitOfWork.deletedItems).toEqual([])
    expect(unitOfWork.touchedBatches).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
    expect([...unitOfWork.activeLinks.keys()]).toEqual([REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID])
  })

  test('aborts when another transaction takes the batch out of draft', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    unitOfWork.touchConflict = true
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.removeItem({ ...REMOVAL_INPUT }))

    expect(error.status).toBe(409)
    expect(error.code).toBe('CTE_BATCH_INVALID_STATE')
    expect(unitOfWork.deletedItems).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('answers not found for an unknown batch', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    unitOfWork.batch = null
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.removeItem({ ...REMOVAL_INPUT }))

    expect(error.status).toBe(404)
    expect(error.code).toBe('CTE_BATCH_NOT_FOUND')
    expect(unitOfWork.deletedItems).toEqual([])
  })

  test('answers not found for an item outside the batch', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.removeItem({ ...REMOVAL_INPUT, itemId: SECOND_ITEM_ID }),
    )

    expect(error.status).toBe(404)
    expect(error.code).toBe('CTE_BATCH_ITEM_NOT_FOUND')
    expect(error.message).not.toContain(COMPANY_CONTEXT.companyId)
    expect(unitOfWork.deletedItems).toEqual([])
    expect(unitOfWork.touchedBatches).toEqual([])
  })

  test('never reads an item of another company', async () => {
    const unitOfWork = createUnitOfWorkWithItem()
    unitOfWork.itemsById.set(SECOND_ITEM_ID, {
      batchId: BATCH_ID,
      companyId: 'company-002',
      documentIds: [],
      id: SECOND_ITEM_ID,
      position: '2',
    })
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.removeItem({ ...REMOVAL_INPUT, itemId: SECOND_ITEM_ID }),
    )

    expect(error.code).toBe('CTE_BATCH_ITEM_NOT_FOUND')
    expect(unitOfWork.itemQueries).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId, itemId: SECOND_ITEM_ID },
    ])
    expect(unitOfWork.itemsById.has(SECOND_ITEM_ID)).toBe(true)
  })
})

function createUnitOfWorkWithItem(): CteBatchUnitOfWorkFixture {
  const unitOfWork = new CteBatchUnitOfWorkFixture()
  unitOfWork.itemsById.set(ITEM_ID, {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
    id: ITEM_ID,
    position: '1',
  })
  unitOfWork.activeLinks.set(REFERENCE_DOCUMENT_ID, BATCH_ID)
  unitOfWork.activeLinks.set(SECOND_DOCUMENT_ID, BATCH_ID)

  return unitOfWork
}
