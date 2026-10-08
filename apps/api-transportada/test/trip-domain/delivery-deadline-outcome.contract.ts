/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: o desfecho da nota que a política do prazo lê. Quem encerra a nota (devolvida ao
 * contratante, cancelada, liberada, devolvida) vence a entrega; o que sobra é entregue ou pendente.
 */
import { describe, expect, test } from 'bun:test'

import type { DeliveryOutcomeKind } from '../../src/trips/domain/delivery-deadline-outcome.policy.js'
import { resolveDeliveryOutcomeKind } from '../../src/trips/domain/delivery-deadline-outcome.policy.js'
import type { ResolveDeliveryOutcomeKindParams } from '../../src/trips/domain/delivery-deadline-outcome.policy.js'

const OPEN_NOTE: ResolveDeliveryOutcomeKindParams = {
  isNfeCancelled: false,
  isReleased: false,
  returnToContractor: 'none',
  separationStatus: 'pending',
}

type OutcomeCase = {
  readonly expected: DeliveryOutcomeKind
  readonly name: string
  readonly note: Partial<ResolveDeliveryOutcomeKindParams>
}

const OUTCOME_CASES: OutcomeCase[] = [
  { expected: 'pending', name: 'pendente', note: {} },
  { expected: 'pending', name: 'separada', note: { separationStatus: 'separated' } },
  { expected: 'pending', name: 'carregada', note: { separationStatus: 'loaded' } },
  { expected: 'delivered', name: 'entregue', note: { separationStatus: 'delivered' } },
  { expected: 'returned', name: 'devolvida na rua', note: { separationStatus: 'returned' } },
  { expected: 'released', name: 'liberada', note: { isReleased: true } },
  { expected: 'cancelled', name: 'NF-e cancelada', note: { isNfeCancelled: true } },
  {
    expected: 'returned_to_contractor',
    name: 'a devolver',
    note: { returnToContractor: 'marked' },
  },
  {
    expected: 'returned_to_contractor',
    name: 'devolvida',
    note: { returnToContractor: 'returned' },
  },
  { expected: 'pending', name: 'sem linha de chegada', note: { returnToContractor: null } },
  {
    expected: 'cancelled',
    name: 'NF-e cancelada vence a entrega',
    note: { isNfeCancelled: true, separationStatus: 'delivered' },
  },
  {
    expected: 'released',
    name: 'liberada vence a devolução na rua',
    note: { isReleased: true, separationStatus: 'returned' },
  },
  {
    expected: 'returned_to_contractor',
    name: 'a devolver vence a NF-e cancelada',
    note: { isNfeCancelled: true, returnToContractor: 'marked' },
  },
]

describe('spec 236 T1.2c — o desfecho da nota para o prazo', () => {
  test.each(OUTCOME_CASES)('$name → $expected', ({ expected, note }) => {
    expect(resolveDeliveryOutcomeKind({ ...OPEN_NOTE, ...note })).toBe(expected)
  })
})
