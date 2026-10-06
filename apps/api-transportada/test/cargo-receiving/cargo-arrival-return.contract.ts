/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.3–9.5): a marcação "devolver ao contratante" é ortogonal ao eixo da
 * nota. `none → marked → returned`, desfazer volta a `none`, `returned` é terminal, repetir é no-op.
 * A ocorrência de recebimento só abre em nota conferida, dentro da janela, em chegada aberta.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCargoArrivalOccurrenceFingerprint,
  decideCargoArrivalOccurrenceOpening,
} from '../../src/cargo-receiving/domain/cargo-arrival-occurrence.policy.js'
import {
  decideCargoArrivalReturn,
  findCargoArrivalClosePending,
  isPendingSeparation,
} from '../../src/cargo-receiving/domain/cargo-arrival-return.policy.js'
import { decideCargoArrivalBatch } from '../../src/cargo-receiving/domain/cargo-arrival-transition.policy.js'

const OCCURRENCE = 'occ-1'
const OTHER_OCCURRENCE = 'occ-2'

function decide(overrides: Partial<Parameters<typeof decideCargoArrivalReturn>[0]> = {}) {
  return decideCargoArrivalReturn({
    action: 'mark',
    arrivalStatus: 'open',
    caseStatus: null,
    current: { occurrenceId: null, state: 'none' },
    isInLiveTrip: false,
    occurrence: { id: OCCURRENCE, isCancelled: false },
    ...overrides,
  })
}

describe('a marcação "devolver ao contratante" (spec 237 RF8a)', () => {
  test('marcar uma nota sem destino a marca com a ocorrência de origem', () => {
    expect(decide()).toEqual({
      next: { occurrenceId: OCCURRENCE, state: 'marked' },
      outcome: 'changed',
    })
  })

  test.each([
    [
      'marcar de novo com a mesma ocorrência',
      { current: { occurrenceId: OCCURRENCE, state: 'marked' } },
      { outcome: 'unchanged' },
    ],
    [
      'marcar de novo com outra ocorrência',
      {
        current: { occurrenceId: OCCURRENCE, state: 'marked' },
        occurrence: { id: OTHER_OCCURRENCE, isCancelled: false },
      },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_ALREADY_MARKED' },
    ],
    [
      'marcar a devolvida',
      { current: { occurrenceId: OCCURRENCE, state: 'returned' } },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_RETURNED' },
    ],
    [
      'marcar sem ocorrência desta nota',
      { occurrence: null },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID' },
    ],
    [
      'marcar com ocorrência cancelada',
      { occurrence: { id: OCCURRENCE, isCancelled: true } },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID' },
    ],
    [
      'marcar nota em viagem viva',
      { isInLiveTrip: true },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP' },
    ],
    [
      'marcar com a tratativa da origem cancelada',
      { caseStatus: 'cancelled' },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_CASE_CANCELLED' },
    ],
    [
      'marcar em chegada fechada',
      { arrivalStatus: 'closed' },
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' },
    ],
  ] as const)('%s', (_label, overrides, expected) => {
    expect(decide(overrides)).toEqual(expected)
  })

  test.each([
    [
      'desfazer a marcada volta a none',
      'unmark',
      'marked',
      null,
      { next: { occurrenceId: null, state: 'none' }, outcome: 'changed' },
    ],
    ['desfazer sem marca é no-op', 'unmark', 'none', null, { outcome: 'unchanged' }],
    [
      'desfazer a devolvida é recusado',
      'unmark',
      'returned',
      null,
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_RETURNED' },
    ],
    [
      'concluir a marcada com a tratativa decidida',
      'complete',
      'marked',
      'decided',
      { next: { occurrenceId: OCCURRENCE, state: 'returned' }, outcome: 'changed' },
    ],
    [
      'concluir a marcada com a tratativa fechada',
      'complete',
      'marked',
      'closed',
      { next: { occurrenceId: OCCURRENCE, state: 'returned' }, outcome: 'changed' },
    ],
    [
      'concluir a marcada sem tratativa (o ADR pede decidida ou fechada)',
      'complete',
      'marked',
      null,
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_DECISION_PENDING' },
    ],
    [
      'concluir com a tratativa cancelada depois da marcação',
      'complete',
      'marked',
      'cancelled',
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_CASE_CANCELLED' },
    ],
    [
      'concluir com a tratativa ainda no escritório',
      'complete',
      'marked',
      'under_review',
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_DECISION_PENDING' },
    ],
    [
      'concluir com a tratativa esperando o contratante',
      'complete',
      'marked',
      'awaiting_contractor',
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_DECISION_PENDING' },
    ],
    [
      'concluir sem marca',
      'complete',
      'none',
      null,
      { outcome: 'refused', reason: 'CARGO_ARRIVAL_RETURN_NOT_MARKED' },
    ],
    [
      'concluir a devolvida é no-op (terminal)',
      'complete',
      'returned',
      'decided',
      { outcome: 'unchanged' },
    ],
  ] as const)('%s', (_label, action, state, caseStatus, expected) => {
    const occurrenceId = state === 'none' ? null : OCCURRENCE
    expect(
      decide({ action, caseStatus, current: { occurrenceId, state }, occurrence: null }),
    ).toEqual(expected)
  })

  test('concluir a marcada em viagem viva é recusado, como marcar: a viagem despacharia nota devolvida', () => {
    expect(
      decide({
        action: 'complete',
        caseStatus: 'decided',
        current: { occurrenceId: OCCURRENCE, state: 'marked' },
        isInLiveTrip: true,
        occurrence: null,
      }),
    ).toEqual({ outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP' })
  })

  test('chegada fechada recusa desfazer e concluir', () => {
    for (const action of ['unmark', 'complete'] as const) {
      expect(
        decide({
          action,
          arrivalStatus: 'closed',
          caseStatus: 'decided',
          current: { occurrenceId: OCCURRENCE, state: 'marked' },
        }),
      ).toEqual({ outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' })
    }
  })
})

describe('a separação respeita a marcação (ADR-0094 §9.3)', () => {
  const rows = [
    { id: 'r1', nfeDocumentId: 'n1', returnToContractor: 'marked', separationState: 'received' },
    { id: 'r2', nfeDocumentId: 'n2', returnToContractor: 'returned', separationState: 'received' },
    { id: 'r3', nfeDocumentId: 'n3', returnToContractor: 'none', separationState: 'received' },
  ] as const

  test('separar nota marcada ou devolvida é recusado; as outras seguem', () => {
    const decision = decideCargoArrivalBatch({
      arrivalStatus: 'open',
      documentIds: ['n1', 'n2', 'n3'],
      rows,
      to: 'separated',
    })
    expect(decision.results).toEqual([
      { documentId: 'n1', outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_MARKED_FOR_RETURN' },
      { documentId: 'n2', outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_RETURNED' },
      { documentId: 'n3', outcome: 'changed' },
    ])
    expect(decision.changed.map((row) => row.id)).toEqual(['r3'])
  })

  test('fechar exige devolvida, ou sem marca e separada; marcada bloqueia mesmo separada', () => {
    expect(
      findCargoArrivalClosePending([
        { nfeDocumentId: 'a', returnToContractor: 'returned', separationState: 'received' },
        { nfeDocumentId: 'b', returnToContractor: 'none', separationState: 'separated' },
        { nfeDocumentId: 'c', returnToContractor: 'marked', separationState: 'separated' },
        { nfeDocumentId: 'd', returnToContractor: 'none', separationState: 'received' },
      ]),
    ).toEqual([
      { documentId: 'c', reason: 'marked_for_return' },
      { documentId: 'd', reason: 'not_separated' },
    ])
  })

  test('vencida só conta a nota sem marca que ainda não foi separada', () => {
    expect(isPendingSeparation({ returnToContractor: 'none', separationState: 'received' })).toBe(
      true,
    )
    expect(isPendingSeparation({ returnToContractor: 'none', separationState: 'separated' })).toBe(
      false,
    )
    expect(isPendingSeparation({ returnToContractor: 'marked', separationState: 'received' })).toBe(
      false,
    )
    expect(
      isPendingSeparation({ returnToContractor: 'returned', separationState: 'received' }),
    ).toBe(false)
  })
})

describe('abrir a ocorrência de recebimento (spec 237 RF8, CA6)', () => {
  const arrivedAt = new Date('2026-10-06T08:00:00.000Z')
  const dueAt = new Date('2026-10-07T08:00:00.000Z')

  function open(
    overrides: Partial<Parameters<typeof decideCargoArrivalOccurrenceOpening>[0]> = {},
  ) {
    return decideCargoArrivalOccurrenceOpening({
      arrivalStatus: 'open',
      now: new Date(arrivedAt.getTime() + 3_600_000),
      returnToContractor: 'none',
      separationDueAt: dueAt,
      separationState: 'received',
      ...overrides,
    })
  }

  test('nota conferida, dentro da janela, abre', () => {
    expect(open()).toBeNull()
    expect(open({ separationState: 'separated' })).toBeNull()
    expect(open({ returnToContractor: 'marked' })).toBeNull()
    expect(open({ now: dueAt })).toBeNull()
  })

  test.each([
    [
      'depois do prazo',
      { now: new Date(dueAt.getTime() + 1) },
      'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED',
    ],
    ['nota ainda esperada', { separationState: 'expected' }, 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED'],
    ['nota devolvida', { returnToContractor: 'returned' }, 'CARGO_ARRIVAL_DOCUMENT_RETURNED'],
    ['chegada fechada', { arrivalStatus: 'closed' }, 'CARGO_ARRIVAL_CLOSED'],
  ] as const)('recusa: %s', (_label, overrides, reason) => {
    expect(open(overrides)).toBe(reason)
  })

  test('chegada sem janela (perfil sem regra) aceita enquanto aberta', () => {
    expect(open({ now: new Date('2027-01-01T00:00:00.000Z'), separationDueAt: null })).toBeNull()
  })

  test('a impressão do pedido não depende da ordem dos campos, só do conteúdo', () => {
    const base = {
      arrivalId: 'a',
      attachmentSha256: 'f'.repeat(64),
      documentId: 'd',
      note: 'caixa amassada',
      occurrenceTypeId: 't',
      productCode: '',
      productCodes: ['P1', 'P2'],
      productQuantities: ['1', '2'],
      productQuantityUnits: ['CX', 'UN'],
    }
    const fingerprint = buildCargoArrivalOccurrenceFingerprint(base)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(buildCargoArrivalOccurrenceFingerprint({ ...base })).toBe(fingerprint)
    expect(buildCargoArrivalOccurrenceFingerprint({ ...base, note: 'outra' })).not.toBe(fingerprint)
    expect(
      buildCargoArrivalOccurrenceFingerprint({ ...base, attachmentSha256: 'e'.repeat(64) }),
    ).not.toBe(fingerprint)
    expect(
      buildCargoArrivalOccurrenceFingerprint({ ...base, productQuantities: ['2', '1'] }),
    ).not.toBe(fingerprint)
  })
})
