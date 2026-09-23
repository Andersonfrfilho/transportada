/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: o caso de uso das ações internas da tratativa. Dublê de repositório contando
 * chamadas — a nota ausente em `warehouse_return`/`cancel` nunca deve alcançar o repositório, e a
 * recusa da máquina (agora dentro do repositório) deve ser propagada sem engolir.
 *
 * ⚠️ **O dublê reflete a entrada.** A versão anterior recebia o resultado pronto por parâmetro e
 * devolvia `closed` para qualquer chamada, ignorando o que lhe era entregue — foi por isso que o
 * `hasSettlementItems: false` fixo do chamador (B1 da revisão final) atravessou a suíte inteira sem
 * nenhum teste reclamar. Aqui o destino sai da ação recebida, e a entrega ao repositório é aferida
 * campo a campo.
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceCaseUseCase } from '../../src/trips/application/occurrence-case.use-case.js'
import { OccurrenceCaseNoteRequiredError } from '../../src/trips/application/occurrence-case.use-case.js'
import type {
  OccurrenceCaseRepositoryPort,
  OccurrenceCaseTransitionInput,
  OccurrenceCaseTransitionResult,
} from '../../src/trips/application/occurrence-case.port.js'
import { OccurrenceCaseTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444'
const CASE_ID = '33333333-3333-4333-8333-333333333333'
const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(),
  roles: [],
  userId: USER_ID,
}

/** O destino de cada ação, copiado à mão da máquina (`occurrence-case-state.policy.ts`). */
const DESTINATION: Readonly<
  Record<OccurrenceCaseTransitionInput['action'], OccurrenceCaseTransitionResult['status']>
> = {
  cancel: 'cancelled',
  closure: 'closed',
  contractor_submission: 'awaiting_contractor',
  decide: 'decided',
  review: 'under_review',
  warehouse_return: 'returned_to_warehouse',
}

function createFakeRepository(failure?: Error): {
  readonly calls: OccurrenceCaseTransitionInput[]
  readonly repository: OccurrenceCaseRepositoryPort
} {
  const calls: OccurrenceCaseTransitionInput[] = []
  return {
    calls,
    repository: {
      async transition(input) {
        calls.push(input)
        if (failure !== undefined) throw failure
        return { kind: 'changed', status: DESTINATION[input.action] }
      },
    },
  }
}

describe('occurrence-case use-case (T5)', () => {
  test('review delegates to the repository with actorKind internal', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.review({ caseId: CASE_ID, context: CONTEXT })

    expect(result).toEqual({ kind: 'changed', status: 'under_review' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      action: 'review',
      actorKind: 'internal',
      actorUserId: USER_ID,
      caseId: CASE_ID,
      companyId: COMPANY_ID,
    })
  })

  test('contractor_submission delegates without requiring a note', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.contractorSubmission({ caseId: CASE_ID, context: CONTEXT })

    expect(result.status).toBe('awaiting_contractor')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      action: 'contractor_submission',
      actorKind: 'internal',
      actorUserId: USER_ID,
      caseId: CASE_ID,
      companyId: COMPANY_ID,
      note: '',
    })
  })

  test('closure delegates without requiring a note', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.closure({ caseId: CASE_ID, context: CONTEXT })

    expect(result).toEqual({ kind: 'changed', status: 'closed' })
    expect(calls).toHaveLength(1)
    /**
     * ⚠️ `toEqual` e não `toMatchObject`: é esta asserção que reprova a volta de qualquer
     * pré-condição contada fora da transação (`hasSettlementItems`) na entrada do escritor único.
     */
    expect(calls[0]).toEqual({
      action: 'closure',
      actorKind: 'internal',
      actorUserId: USER_ID,
      caseId: CASE_ID,
      companyId: COMPANY_ID,
      note: '',
    })
  })

  test('warehouse_return without note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(
      useCase.warehouseReturn({ caseId: CASE_ID, context: CONTEXT }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNoteRequiredError)
    expect(calls).toHaveLength(0)
  })

  test('warehouse_return with a blank note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(
      useCase.warehouseReturn({ caseId: CASE_ID, context: CONTEXT, note: '   ' }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNoteRequiredError)
    expect(calls).toHaveLength(0)
  })

  test('warehouse_return with a note delegates to the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.warehouseReturn({
      caseId: CASE_ID,
      context: CONTEXT,
      note: 'devolvida ao galpão',
    })

    expect(result.status).toBe('returned_to_warehouse')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.note).toBe('devolvida ao galpão')
  })

  test('cancel without note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(useCase.cancel({ caseId: CASE_ID, context: CONTEXT })).rejects.toBeInstanceOf(
      OccurrenceCaseNoteRequiredError,
    )
    expect(calls).toHaveLength(0)
  })

  test('cancel with a note delegates to the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.cancel({
      caseId: CASE_ID,
      context: CONTEXT,
      note: 'ocorrência aberta por engano',
    })

    expect(result.status).toBe('cancelled')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ action: 'cancel' })
  })

  test('propagates a refusal from the state machine (inside the repository) without swallowing it', async () => {
    const { repository } = createFakeRepository(new OccurrenceCaseTransitionNotAllowedError())
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(useCase.review({ caseId: CASE_ID, context: CONTEXT })).rejects.toBeInstanceOf(
      OccurrenceCaseTransitionNotAllowedError,
    )
  })

  /** Achado 1 da revisão: a decisão em nome do contratante — nota sempre obrigatória, actorKind fixo. */
  test('decide without note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(
      useCase.decide({ caseId: CASE_ID, context: CONTEXT, kind: 'other', note: '   ' }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNoteRequiredError)
    expect(calls).toHaveLength(0)
  })

  test('decide with a note delegates to the repository with actorKind internal and the decision', async () => {
    const { calls, repository } = createFakeRepository()
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.decide({
      caseId: CASE_ID,
      context: CONTEXT,
      kind: 'redelivery_authorized',
      note: 'contratante não respondeu em cinco dias',
    })

    expect(result).toEqual({ kind: 'changed', status: 'decided' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      action: 'decide',
      actorKind: 'internal',
      actorUserId: USER_ID,
      caseId: CASE_ID,
      companyId: COMPANY_ID,
      decisionKind: 'redelivery_authorized',
      decisionNote: 'contratante não respondeu em cinco dias',
      note: 'contratante não respondeu em cinco dias',
    })
  })
})
