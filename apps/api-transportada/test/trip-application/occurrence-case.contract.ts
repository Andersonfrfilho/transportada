/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T5: o caso de uso das ações internas da tratativa. Dublê de repositório contando
 * chamadas — a nota ausente em `warehouse_return`/`cancel` nunca deve alcançar o repositório, e a
 * recusa da máquina (agora dentro do repositório) deve ser propagada sem engolir.
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

function createFakeRepository(
  result:
    | { readonly kind: 'result'; readonly value: OccurrenceCaseTransitionResult }
    | { readonly error: Error; readonly kind: 'error' },
): {
  readonly calls: OccurrenceCaseTransitionInput[]
  readonly repository: OccurrenceCaseRepositoryPort
} {
  const calls: OccurrenceCaseTransitionInput[] = []
  return {
    calls,
    repository: {
      async transition(input) {
        calls.push(input)
        if (result.kind === 'error') throw result.error
        return result.value
      },
    },
  }
}

describe('occurrence-case use-case (T5)', () => {
  test('review delegates to the repository with actorKind internal', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'under_review' },
    })
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
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'awaiting_contractor' },
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.contractorSubmission({ caseId: CASE_ID, context: CONTEXT })

    expect(result.status).toBe('awaiting_contractor')
    expect(calls).toHaveLength(1)
  })

  test('closure delegates without requiring a note', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'closed' },
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    const result = await useCase.closure({ caseId: CASE_ID, context: CONTEXT })

    expect(result.status).toBe('closed')
    expect(calls).toHaveLength(1)
  })

  test('warehouse_return without note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'returned_to_warehouse' },
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(
      useCase.warehouseReturn({ caseId: CASE_ID, context: CONTEXT }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNoteRequiredError)
    expect(calls).toHaveLength(0)
  })

  test('warehouse_return with a blank note never calls the repository', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'returned_to_warehouse' },
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(
      useCase.warehouseReturn({ caseId: CASE_ID, context: CONTEXT, note: '   ' }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNoteRequiredError)
    expect(calls).toHaveLength(0)
  })

  test('warehouse_return with a note delegates to the repository', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'returned_to_warehouse' },
    })
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
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'cancelled' },
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(useCase.cancel({ caseId: CASE_ID, context: CONTEXT })).rejects.toBeInstanceOf(
      OccurrenceCaseNoteRequiredError,
    )
    expect(calls).toHaveLength(0)
  })

  test('cancel with a note delegates to the repository', async () => {
    const { calls, repository } = createFakeRepository({
      kind: 'result',
      value: { kind: 'changed', status: 'cancelled' },
    })
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
    const { repository } = createFakeRepository({
      error: new OccurrenceCaseTransitionNotAllowedError(),
      kind: 'error',
    })
    const useCase = createOccurrenceCaseUseCase({ repository })

    await expect(useCase.review({ caseId: CASE_ID, context: CONTEXT })).rejects.toBeInstanceOf(
      OccurrenceCaseTransitionNotAllowedError,
    )
  })
})
