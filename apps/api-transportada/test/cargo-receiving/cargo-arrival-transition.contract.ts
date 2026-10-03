/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.1 (ADR-0094 §1): o eixo da nota na chegada é `expected → received → separated`, sem
 * pular etapa e sem volta; repetir é no-op; chegada fechada não aceita transição. A chegada copia a
 * janela e o prazo do perfil no registro, e `separation_due_at` sai só dela.
 */
import { describe, expect, test } from 'bun:test'

import {
  CARGO_ARRIVAL_INITIAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_TRANSITIONS,
  copyArrivalRulesFromProfile,
  decideCargoArrivalTransition,
  isArrivedAtTooFarInFuture,
  isSeparationOverdue,
  resolveSeparationDueAt,
} from '../../src/cargo-receiving/domain/cargo-arrival-transition.policy.js'

const HOUR_MS = 3_600_000

describe('o eixo da nota na chegada (spec 237 T2.1)', () => {
  test('a nota entra esperada, e a tabela só anda para frente, uma etapa por vez', () => {
    expect(CARGO_ARRIVAL_INITIAL_DOCUMENT_STATE).toBe('expected')
    expect(CARGO_ARRIVAL_TRANSITIONS).toEqual({
      expected: ['received'],
      received: ['separated'],
      separated: [],
    })
  })

  test.each([
    ['open', 'expected', 'received', { outcome: 'changed' }],
    [
      'open',
      'expected',
      'separated',
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED' },
    ],
    ['open', 'received', 'received', { outcome: 'unchanged' }],
    ['open', 'received', 'separated', { outcome: 'changed' }],
    ['open', 'separated', 'separated', { outcome: 'unchanged' }],
    [
      'open',
      'separated',
      'received',
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED' },
    ],
    ['closed', 'expected', 'received', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
    ['closed', 'expected', 'separated', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
    ['closed', 'received', 'received', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
    ['closed', 'received', 'separated', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
    ['closed', 'separated', 'separated', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
    ['closed', 'separated', 'received', { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }],
  ] as const)('chegada %s: %s → %s', (arrivalStatus, from, to, decision) => {
    expect(decideCargoArrivalTransition({ arrivalStatus, from, to })).toEqual(decision)
  })
})

describe('os relógios da chegada (spec 237 T2.1, ADR-0094 §2)', () => {
  const arrivedAt = new Date('2026-10-03T08:15:00.000Z')

  test('o prazo da separação são horas corridas desde a chegada', () => {
    expect(resolveSeparationDueAt({ arrivedAt, separationWindowHours: 24 })).toEqual(
      new Date('2026-10-04T08:15:00.000Z'),
    )
    expect(resolveSeparationDueAt({ arrivedAt, separationWindowHours: 1 })).toEqual(
      new Date(arrivedAt.getTime() + HOUR_MS),
    )
  })

  test('sem janela no perfil, a chegada nasce sem relógio de separação', () => {
    expect(resolveSeparationDueAt({ arrivedAt, separationWindowHours: null })).toBeNull()
  })

  test('a chegada copia a janela e o prazo do perfil ligado', () => {
    expect(
      copyArrivalRulesFromProfile({
        deliveryDeadlineBusinessDays: 3,
        isEnabled: true,
        separationWindowHours: 24,
      }),
    ).toEqual({ deliveryDeadlineBusinessDays: 3, separationWindowHours: 24 })
    expect(
      copyArrivalRulesFromProfile({
        deliveryDeadlineBusinessDays: null,
        isEnabled: true,
        separationWindowHours: null,
      }),
    ).toEqual({ deliveryDeadlineBusinessDays: null, separationWindowHours: null })
  })

  test('perfil ausente ou desligado não abre chegada', () => {
    expect(copyArrivalRulesFromProfile(null)).toBeNull()
    expect(
      copyArrivalRulesFromProfile({
        deliveryDeadlineBusinessDays: 3,
        isEnabled: false,
        separationWindowHours: 24,
      }),
    ).toBeNull()
  })

  test.each([
    ['agora', 0, false],
    ['2 min no futuro, dentro da folga', 2 * 60_000, false],
    ['2 min e 1 ms no futuro', 2 * 60_000 + 1, true],
    ['30 dias no passado', -30 * 24 * HOUR_MS, false],
  ] as const)('chegada %s → no futuro demais: %p', (_label, offsetMs, isFuture) => {
    const when = new Date(arrivedAt.getTime() + offsetMs)

    expect(isArrivedAtTooFarInFuture({ arrivedAt: when, now: arrivedAt })).toBe(isFuture)
  })

  test.each([
    ['sem relógio nunca vence', null, 5, 1, false],
    ['antes do prazo', 24, 23, 3, false],
    ['no instante do prazo ainda não venceu', 24, 24, 3, false],
    ['depois do prazo com nota pendente', 24, 25, 1, true],
    ['depois do prazo, mas tudo separado', 24, 25, 0, false],
  ] as const)('%s', (_label, windowHours, elapsedHours, pendingDocumentCount, isOverdue) => {
    const separationDueAt = resolveSeparationDueAt({
      arrivedAt,
      separationWindowHours: windowHours,
    })
    const now = new Date(arrivedAt.getTime() + elapsedHours * HOUR_MS)

    expect(isSeparationOverdue({ now, pendingDocumentCount, separationDueAt })).toBe(isOverdue)
  })
})
