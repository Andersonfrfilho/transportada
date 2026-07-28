/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_ACCESS_KEY,
  AUTHORIZED_ISSUANCE,
  AUTHORIZED_PROTOCOL,
  AUTHORIZED_RESERVATION_ID,
  BATCH_ID,
  BATCH_ITEM_ID,
  CANCEL_FINGERPRINT,
  CANCEL_IDEMPOTENCY_KEY,
  CANCEL_JUSTIFICATION,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  OTHER_BATCH_ID,
  OTHER_BATCH_ITEM_ID,
  createCteIssuanceUseCaseForTest,
  CteIssuanceUnitOfWorkFixture,
  captureApiError,
} from './support.js'
import type {
  CteIssuanceCancelInput,
  CteIssuanceRecord,
  CteIssuanceUseCaseContract,
} from './support.js'

function createCancelInput(
  overrides: Partial<CteIssuanceCancelInput> = {},
): CteIssuanceCancelInput {
  return {
    batchId: BATCH_ID,
    batchItemId: BATCH_ITEM_ID,
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: CANCEL_IDEMPOTENCY_KEY,
    justification: CANCEL_JUSTIFICATION,
    ...overrides,
  }
}

function createAuthorizedUnitOfWork(): CteIssuanceUnitOfWorkFixture {
  const unitOfWork = new CteIssuanceUnitOfWorkFixture()
  unitOfWork.issuanceResult = AUTHORIZED_ISSUANCE
  return unitOfWork
}

describe('CT-e issuance application cancel contract', () => {
  test('turns an authorized CT-e into a cancel attempt bound to the fiscal document', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.cancel(createCancelInput())

    expect(result).toMatchObject({
      attemptKind: 'cancel',
      attemptNumber: 2,
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      correlationId: CORRELATION_ID,
      status: 'requested',
    })
    expect(unitOfWork.cancellationRequests).toHaveLength(1)
    expect(unitOfWork.cancellationRequests[0]).toMatchObject({
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      justification: CANCEL_JUSTIFICATION,
    })
  })

  test('reuses the authorized reservation, series and number instead of burning a new one', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    await useCase.cancel(createCancelInput())

    expect(unitOfWork.reservations).toEqual([])
    expect(unitOfWork.attempts).toHaveLength(1)
    expect(unitOfWork.attempts[0]).toMatchObject({
      attemptKind: 'cancel',
      fiscalNumber: AUTHORIZED_ISSUANCE.context.fiscalNumber,
      fiscalSeries: AUTHORIZED_ISSUANCE.context.fiscalSeries,
      reservationId: AUTHORIZED_RESERVATION_ID,
    })
  })

  test('publishes the cancel command on the issuance outbox with its own event type', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    await useCase.cancel(createCancelInput())

    expect(unitOfWork.commandOutbox).toHaveLength(1)
    expect(unitOfWork.commandOutbox[0]).toMatchObject({
      attemptKind: 'cancel',
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventType: 'transportada.cte.item.cancel.requested',
      status: 'requested',
    })
    expect(unitOfWork.events).toHaveLength(1)
    expect(unitOfWork.events[0]).toMatchObject({
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'cancel_requested',
    })
  })

  test('keeps the justification out of the queued command so only the tenant row carries it', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    await useCase.cancel(createCancelInput())

    expect(JSON.stringify(unitOfWork.commandOutbox)).not.toContain(CANCEL_JUSTIFICATION)
    expect(JSON.stringify(unitOfWork.commandOutbox)).not.toContain(AUTHORIZED_ACCESS_KEY)
    expect(JSON.stringify(unitOfWork.commandOutbox)).not.toContain(AUTHORIZED_PROTOCOL)
  })

  test('refuses to cancel an item that SEFAZ never authorized', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() => useCase.cancel(createCancelInput()))

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_CANCELLABLE',
      message: 'CT-e issuance cannot be cancelled',
      status: 409,
    })
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.commandOutbox).toEqual([])
    expect(unitOfWork.cancellationRequests).toEqual([])
  })

  test('refuses to cancel twice once the item is already cancelled', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    unitOfWork.issuanceResult = {
      ...AUTHORIZED_ISSUANCE,
      context: { ...AUTHORIZED_ISSUANCE.context, status: 'cancelled' },
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() => useCase.cancel(createCancelInput()))

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_NOT_CANCELLABLE', status: 409 })
    expect(unitOfWork.attempts).toEqual([])
  })

  test('refuses to cancel when the authorization protocol is missing', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const withoutProtocol = { ...AUTHORIZED_ISSUANCE, protocol: undefined }
    unitOfWork.issuanceResult = withoutProtocol as unknown as CteIssuanceRecord
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() => useCase.cancel(createCancelInput()))

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_CANCELLATION_UNAVAILABLE',
      status: 422,
    })
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.cancellationRequests).toEqual([])
  })

  test('rejects a justification shorter than the 15 characters SEFAZ demands', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.cancel(createCancelInput({ justification: 'erro' })),
    )

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_INVALID_JUSTIFICATION',
      status: 400,
    })
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.commandOutbox).toEqual([])
  })

  test('replays the cancel idempotency key and refuses a diverging justification', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const first = await useCase.cancel(createCancelInput())
    const replay = await useCase.cancel(createCancelInput())

    expect(replay).toEqual(first)
    expect(unitOfWork.attempts).toHaveLength(1)
    expect(unitOfWork.commandOutbox).toHaveLength(1)

    unitOfWork.cancelReplay = {
      requestFingerprint: 'another-cancel-fingerprint',
      response: first,
    }
    const error = await captureApiError(() => useCase.cancel(createCancelInput()))

    expect(error).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
    expect(JSON.stringify(error)).not.toContain(CANCEL_JUSTIFICATION)
  })

  test('applies anti-enumeration for cross-tenant cancel requests', async () => {
    const unitOfWork = createAuthorizedUnitOfWork()
    unitOfWork.batch = { ...unitOfWork.batch, id: OTHER_BATCH_ID, companyId: 'company-002' }
    unitOfWork.batchItem = {
      id: OTHER_BATCH_ITEM_ID,
      batchId: OTHER_BATCH_ID,
      companyId: 'company-002',
      status: 'authorized',
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      CANCEL_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.cancel(
        createCancelInput({ batchId: OTHER_BATCH_ID, batchItemId: OTHER_BATCH_ITEM_ID }),
      ),
    )

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_FOUND',
      message: 'CT-e issuance not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(BATCH_ID)
    expect(unitOfWork.cancellationRequests).toEqual([])
  })
})
