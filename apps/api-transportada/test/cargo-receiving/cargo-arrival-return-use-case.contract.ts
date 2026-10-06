/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8a (ADR-0094 §9.3–9.5): marcar, desfazer e concluir a devolução ao contratante, sempre
 * dentro da transação que travou a chegada e a nota; a decisão é da política pura.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoArrivalReturnTransactionPort } from '../../src/cargo-receiving/application/cargo-arrival-occurrence.port.js'
import type {
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
} from '../../src/cargo-receiving/application/cargo-arrival-occurrence.types.js'
import { createChangeCargoArrivalReturnUseCase } from '../../src/cargo-receiving/application/cargo-arrival-return.use-case.js'
import {
  ARRIVAL,
  CONTEXT,
  DOCUMENT,
  NOW,
} from '../fixtures/cargo-arrival-occurrence-use-case.fixture.js'

type ReturnOverrides = Partial<{
  arrival: LockedOccurrenceArrival | null
  caseStatus: 'awaiting_contractor' | 'decided' | null
  document: LockedOccurrenceDocument | null
  occurrence: { id: string; isCancelled: boolean } | null
}>

function returns(overrides: ReturnOverrides = {}) {
  const applied: unknown[] = []
  const transaction: CargoArrivalReturnTransactionPort = {
    applyReturn: async (input) => void applied.push(input),
    findCaseStatus: async () => ('caseStatus' in overrides ? (overrides.caseStatus ?? null) : null),
    findDocumentOccurrence: async () =>
      'occurrence' in overrides
        ? (overrides.occurrence ?? null)
        : { id: 'occurrence-1', isCancelled: false },
    lockArrival: async () => ('arrival' in overrides ? (overrides.arrival ?? null) : ARRIVAL),
    lockDocument: async () => ('document' in overrides ? (overrides.document ?? null) : DOCUMENT),
  }
  const useCase = createChangeCargoArrivalReturnUseCase({
    channel: 'backoffice',
    now: () => NOW,
    unitOfWork: { execute: ({ operation }) => operation(transaction) },
  })
  return { applied, execute: useCase.execute }
}

const RETURN_INPUT = {
  action: 'mark',
  arrivalId: 'arrival-1',
  context: CONTEXT,
  correlationId: 'c-2',
  documentId: 'nfe-1',
  note: '',
  occurrenceId: 'occurrence-1',
} as const

describe('marcar, desfazer e concluir a devolução (spec 237 RF8a)', () => {
  test('marcar grava o antes e o depois, com ator e canal', async () => {
    const { applied, execute } = returns()

    expect(await execute(RETURN_INPUT)).toEqual({
      documentId: 'nfe-1',
      outcome: 'changed',
      returnOccurrenceId: 'occurrence-1',
      returnToContractor: 'marked',
    })
    expect(applied).toEqual([
      expect.objectContaining({
        action: 'mark',
        actorUserId: 'user-1',
        arrivalDocumentId: 'arrival-document-1',
        channel: 'backoffice',
        from: { occurrenceId: null, state: 'none' },
        next: { occurrenceId: 'occurrence-1', state: 'marked' },
      }),
    ])
  })

  test('repetir o estado atual não grava', async () => {
    const { applied, execute } = returns()

    expect(await execute({ ...RETURN_INPUT, action: 'unmark', occurrenceId: null })).toMatchObject({
      outcome: 'unchanged',
      returnToContractor: 'none',
    })
    expect(applied).toEqual([])
  })

  test.each([
    [
      'ocorrência de outra nota',
      { occurrence: null },
      'mark',
      422,
      'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID',
    ],
    [
      'chegada fechada',
      { arrival: { ...ARRIVAL, status: 'closed' } },
      'mark',
      409,
      'CARGO_ARRIVAL_CLOSED',
    ],
    ['chegada de outra empresa', { arrival: null }, 'mark', 404, 'CARGO_ARRIVAL_NOT_FOUND'],
    ['nota fora da chegada', { document: null }, 'mark', 404, 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'],
    [
      'concluir sem decisão do contratante',
      {
        caseStatus: 'awaiting_contractor',
        document: { ...DOCUMENT, returnOccurrenceId: 'occurrence-1', returnToContractor: 'marked' },
      },
      'complete',
      409,
      'CARGO_ARRIVAL_RETURN_DECISION_PENDING',
    ],
  ] as const)('%s é recusado sem gravar', async (_label, overrides, action, status, code) => {
    const { applied, execute } = returns(overrides)

    await expect(execute({ ...RETURN_INPUT, action })).rejects.toMatchObject({ code, status })
    expect(applied).toEqual([])
  })

  test('concluir com a tratativa decidida devolve a nota', async () => {
    const { applied, execute } = returns({
      caseStatus: 'decided',
      document: { ...DOCUMENT, returnOccurrenceId: 'occurrence-1', returnToContractor: 'marked' },
    })

    expect(
      await execute({ ...RETURN_INPUT, action: 'complete', occurrenceId: null }),
    ).toMatchObject({ outcome: 'changed', returnToContractor: 'returned' })
    expect(applied).toHaveLength(1)
  })
})
