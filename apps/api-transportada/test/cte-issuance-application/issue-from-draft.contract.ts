/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CteIssuanceUnitOfWorkFixture,
  IDEMPOTENCY_KEY,
  ISSUE_FINGERPRINT,
  captureApiError,
  createCteIssuanceUseCaseForTest,
  type CteIssuanceRecord,
} from './support.js'

const ISSUE_INPUT = {
  batchId: BATCH_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
}

/** Tentativa aberta: `in_flight` no banco chega aqui como `requested`. */
const PENDING_ISSUANCE: CteIssuanceRecord = {
  batchId: BATCH_ID,
  companyId: COMPANY_CONTEXT.companyId,
  context: {
    attemptKind: 'issue',
    attemptNumber: 1,
    batchItemId: BATCH_ITEM_ID,
    companyId: COMPANY_CONTEXT.companyId,
    correlationId: CORRELATION_ID,
    fingerprint: ISSUE_FINGERPRINT,
    fiscalEnvironment: 'homologation',
    fiscalNumber: '100000001',
    fiscalSeries: '1',
    idempotencyKey: IDEMPOTENCY_KEY,
    retryCount: 0,
    status: 'requested',
  },
  issueRequestedAt: '2026-08-02T19:11:32.156Z',
}

function buildUnitOfWork(status: string): CteIssuanceUnitOfWorkFixture {
  const unitOfWork = new CteIssuanceUnitOfWorkFixture()
  unitOfWork.batch = { companyId: COMPANY_CONTEXT.companyId, id: BATCH_ID, status }
  return unitOfWork
}

describe('CT-e issuance from a draft batch contract', () => {
  /**
   * Transmitir é o único passo que o operador comanda: o lote sai do rascunho dentro da mesma
   * transação da emissão, para não existir instante em que ele emite e ainda aceite edição.
   */
  test('takes the batch out of draft in the same transaction that requests the issuance', async () => {
    const unitOfWork = buildUnitOfWork('draft')
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.executedTransactions).toEqual(['cte-issuance'])
    expect(unitOfWork.draftSubmissions).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestFingerprint: ISSUE_FINGERPRINT,
        userId: COMPANY_CONTEXT.userId,
      },
    ])
    expect(unitOfWork.reservations).toHaveLength(1)
    expect(unitOfWork.commandOutbox).toHaveLength(1)
  })

  test('leaves an already submitted batch untouched', async () => {
    const unitOfWork = buildUnitOfWork('submitted')
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.draftSubmissions).toEqual([])
    expect(unitOfWork.commandOutbox).toHaveLength(1)
  })

  /** Retransmitir depois de rejeição não repete a submissão — o lote já saiu do rascunho. */
  test('leaves a failed batch untouched', async () => {
    const unitOfWork = buildUnitOfWork('error')
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.draftSubmissions).toEqual([])
    expect(unitOfWork.commandOutbox).toHaveLength(1)
  })

  /**
   * O lote fica em `submitted` os segundos que o worker leva para pegá-lo. Uma segunda pressão em
   * Transmitir cabe nessa janela e reservaria outro número fiscal para o mesmo item.
   */
  test('refuses a second issuance while the current attempt is still in flight', async () => {
    const unitOfWork = buildUnitOfWork('submitted')
    unitOfWork.issuanceResult = PENDING_ISSUANCE
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

    expect(error.status).toBe(409)
    expect(error.code).toBe('CTE_ISSUANCE_ALREADY_IN_FLIGHT')
    expect(unitOfWork.reservations).toEqual([])
    expect(unitOfWork.commandOutbox).toEqual([])
  })

  /** Retentativa agendada continua sendo um comando legítimo: ela é retransmissão, não duplicata. */
  test('still issues when the last attempt only has a retry scheduled', async () => {
    const unitOfWork = buildUnitOfWork('error')
    unitOfWork.issuanceResult = {
      ...PENDING_ISSUANCE,
      context: { ...PENDING_ISSUANCE.context, status: 'retry_scheduled' },
    }
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.reservations).toHaveLength(1)
    expect(unitOfWork.commandOutbox).toHaveLength(1)
  })

  /**
   * A trava de status vivia só no botão do frontend. Com um botão só, ela precisa existir aqui:
   * emitir lote cancelado, concluído ou em voo duplicaria documento fiscal.
   */
  test.each([['cancelled'], ['done'], ['in_flight']])(
    'refuses to issue a batch in %s',
    async (status) => {
      const unitOfWork = buildUnitOfWork(status)
      const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

      const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

      expect(error.status).toBe(409)
      expect(error.code).toBe('CTE_BATCH_INVALID_STATE')
      expect(unitOfWork.draftSubmissions).toEqual([])
      expect(unitOfWork.reservations).toEqual([])
      expect(unitOfWork.commandOutbox).toEqual([])
    },
  )
})
