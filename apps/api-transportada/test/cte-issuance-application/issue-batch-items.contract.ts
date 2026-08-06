/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_ISSUANCE,
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  IDEMPOTENCY_KEY,
  SIBLING_BATCH_ITEM_ID,
  createCteIssuanceUseCaseForTest,
  CteIssuanceUnitOfWorkFixture,
} from './support.js'
import type { CteIssuanceIssueInput, CteIssuanceUseCaseContract } from './support.js'

function createIssueInput(overrides: Partial<CteIssuanceIssueInput> = {}): CteIssuanceIssueInput {
  return {
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    batchId: BATCH_ID,
    ...overrides,
  }
}

function buildBatchItem(id: string): Record<string, unknown> {
  return {
    id,
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    status: 'approved',
  }
}

function collectBatchItemIds(records: readonly Record<string, unknown>[]): readonly string[] {
  return records.map((record) => record['batchItemId'] as string)
}

describe('CT-e issuance application batch fan-out contract', () => {
  test('requests one issuance per item of the batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batchItems = [buildBatchItem(BATCH_ITEM_ID), buildBatchItem(SIBLING_BATCH_ITEM_ID)]
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    await useCase.issue(createIssueInput())

    expect(collectBatchItemIds(unitOfWork.commandOutbox)).toEqual([
      BATCH_ITEM_ID,
      SIBLING_BATCH_ITEM_ID,
    ])
    expect(collectBatchItemIds(unitOfWork.reservations)).toEqual([
      BATCH_ITEM_ID,
      SIBLING_BATCH_ITEM_ID,
    ])
    expect(collectBatchItemIds(unitOfWork.attempts)).toEqual([BATCH_ITEM_ID, SIBLING_BATCH_ITEM_ID])
    expect(unitOfWork.events).toHaveLength(2)
    expect(unitOfWork.executedTransactions).toEqual(['cte-issuance'])
  })

  test('closes the draft once, not once per item', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batch = { companyId: COMPANY_CONTEXT.companyId, id: BATCH_ID, status: 'draft' }
    unitOfWork.batchItems = [buildBatchItem(BATCH_ITEM_ID), buildBatchItem(SIBLING_BATCH_ITEM_ID)]
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    await useCase.issue(createIssueInput())

    expect(unitOfWork.draftSubmissions).toHaveLength(1)
    expect(unitOfWork.commandOutbox).toHaveLength(2)
  })

  /** O item que ficou para trás precisa de uma segunda via; reemitir o autorizado seria fraude fiscal. */
  test('reissues only the pending item of a partially issued batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batch = { companyId: COMPANY_CONTEXT.companyId, id: BATCH_ID, status: 'in_flight' }
    unitOfWork.batchItems = [buildBatchItem(BATCH_ITEM_ID), buildBatchItem(SIBLING_BATCH_ITEM_ID)]
    unitOfWork.issuanceByItemId.set(BATCH_ITEM_ID, AUTHORIZED_ISSUANCE)
    unitOfWork.issuanceByItemId.set(SIBLING_BATCH_ITEM_ID, null)
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    await useCase.issue(createIssueInput())

    expect(collectBatchItemIds(unitOfWork.commandOutbox)).toEqual([SIBLING_BATCH_ITEM_ID])
    expect(collectBatchItemIds(unitOfWork.reservations)).toEqual([SIBLING_BATCH_ITEM_ID])
    expect(unitOfWork.draftSubmissions).toEqual([])
  })

  test('refuses the command when every item is already in flight', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batch = { companyId: COMPANY_CONTEXT.companyId, id: BATCH_ID, status: 'submitted' }
    unitOfWork.batchItems = [buildBatchItem(BATCH_ITEM_ID), buildBatchItem(SIBLING_BATCH_ITEM_ID)]
    const inFlight = {
      ...AUTHORIZED_ISSUANCE,
      context: { ...AUTHORIZED_ISSUANCE.context, status: 'requested' as const },
    }
    unitOfWork.issuanceByItemId.set(BATCH_ITEM_ID, inFlight)
    unitOfWork.issuanceByItemId.set(SIBLING_BATCH_ITEM_ID, inFlight)
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    await expect(useCase.issue(createIssueInput())).rejects.toMatchObject({
      status: 409,
    })
    expect(unitOfWork.commandOutbox).toEqual([])
  })
})
