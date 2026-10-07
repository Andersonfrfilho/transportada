/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a nota só entra na chegada se for do emitente do contratante, autorizada, fora de
 * viagem viva e de outra chegada — e a recusa diz, de uma vez, o motivo de cada uma.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildArrivalRequestFingerprint,
  findArrivalCandidateRefusals,
  type ArrivalCandidateRow,
} from '../../src/cargo-receiving/domain/cargo-arrival-candidate.policy.js'

const TAX_ID = '30290856000160'

function row(id: string, overrides: Partial<ArrivalCandidateRow> = {}): ArrivalCandidateRow {
  return {
    emitterTaxId: TAX_ID,
    id,
    isInArrival: false,
    isInLiveTrip: false,
    returnToContractor: null,
    status: 'authorized',
    ...overrides,
  }
}

describe('as notas candidatas da chegada (spec 237 T2.3)', () => {
  test.each([
    ['nota do emitente, autorizada, livre', row('a'), null],
    ['nota que não existe nesta empresa', undefined, 'DOCUMENT_NOT_FOUND'],
    [
      'nota de outro emitente',
      row('a', { emitterTaxId: '11222333000181' }),
      'DOCUMENT_FROM_ANOTHER_ISSUER',
    ],
    ['nota sem emitente', row('a', { emitterTaxId: null }), 'DOCUMENT_FROM_ANOTHER_ISSUER'],
    ['nota cancelada', row('a', { status: 'cancelled' }), 'DOCUMENT_NOT_AUTHORIZED'],
    ['nota já em outra chegada', row('a', { isInArrival: true }), 'DOCUMENT_ALREADY_IN_ARRIVAL'],
    ['nota em viagem viva', row('a', { isInLiveTrip: true }), 'DOCUMENT_IN_LIVE_TRIP'],
    [
      'nota marcada para devolver ao contratante (RF8a)',
      row('a', { isInArrival: true, returnToContractor: 'marked' }),
      'DOCUMENT_RETURN_TO_CONTRACTOR',
    ],
    [
      'nota já devolvida ao contratante (RF8a)',
      row('a', { isInArrival: true, returnToContractor: 'returned' }),
      'DOCUMENT_RETURN_TO_CONTRACTOR',
    ],
    [
      'nota de chegada sem marca segue "já em chegada"',
      row('a', { isInArrival: true, returnToContractor: 'none' }),
      'DOCUMENT_ALREADY_IN_ARRIVAL',
    ],
  ] as const)('%s', (_label, candidate, reason) => {
    const refusals = findArrivalCandidateRefusals({
      contractorTaxId: TAX_ID,
      documentIds: ['a'],
      rows: candidate === undefined ? [] : [candidate],
    })

    expect(refusals).toEqual(reason === null ? [] : [{ documentId: 'a', index: 0, reason }])
  })

  test('o emitente errado vence o resto: nada da nota alheia é revelado', () => {
    const refusals = findArrivalCandidateRefusals({
      contractorTaxId: TAX_ID,
      documentIds: ['a'],
      rows: [row('a', { emitterTaxId: '11222333000181', isInLiveTrip: true, status: 'cancelled' })],
    })

    expect(refusals.map((refusal) => refusal.reason)).toEqual(['DOCUMENT_FROM_ANOTHER_ISSUER'])
  })

  test('devolve todas as recusadas, na posição em que vieram', () => {
    const refusals = findArrivalCandidateRefusals({
      contractorTaxId: TAX_ID,
      documentIds: ['a', 'b', 'c', 'd'],
      rows: [row('a'), row('b', { isInLiveTrip: true }), row('d', { isInArrival: true })],
    })

    expect(refusals).toEqual([
      { documentId: 'b', index: 1, reason: 'DOCUMENT_IN_LIVE_TRIP' },
      { documentId: 'c', index: 2, reason: 'DOCUMENT_NOT_FOUND' },
      { documentId: 'd', index: 3, reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
    ])
  })
})

describe('a impressão do pedido de chegada (spec 237 T2.3)', () => {
  const base = {
    arrivedAt: new Date('2026-10-03T08:00:00.000Z'),
    contractorId: '00000000-0000-4000-8000-000000000d01',
    documentIds: ['b', 'a'],
    palletCount: 12,
    reference: 'Lacre 123',
  }

  test('a ordem das notas não muda a impressão; o conteúdo muda', () => {
    const fingerprint = buildArrivalRequestFingerprint(base)

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(buildArrivalRequestFingerprint({ ...base, documentIds: ['a', 'b'] })).toBe(fingerprint)
    expect(buildArrivalRequestFingerprint({ ...base, documentIds: ['a'] })).not.toBe(fingerprint)
    expect(buildArrivalRequestFingerprint({ ...base, palletCount: null })).not.toBe(fingerprint)
    expect(
      buildArrivalRequestFingerprint({ ...base, arrivedAt: new Date('2026-10-03T08:00:01Z') }),
    ).not.toBe(fingerprint)
  })
})
