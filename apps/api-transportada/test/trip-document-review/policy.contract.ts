/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D7, D10–D13): a fila de revisão das notas que não couberam — regras puras.
 */
import { describe, expect, test } from 'bun:test'

import type { UnplacedBox } from '@adatechnology/cargo-placement'

import {
  TRIP_DOCUMENT_REVIEW_REASONS,
  TRIP_DOCUMENT_REVIEW_STATUSES,
  assertCargoLayoutCurrent,
  buildSwapSuggestions,
  checkTripDocumentReviewTransition,
  selectReleasableDocuments,
} from '../../src/trips/domain/trip-document-review.policy.js'
import {
  TripCargoLayoutOutdatedError,
  TripDocumentReviewTransitionError,
} from '../../src/trips/domain/trip-document-review.error.js'

function unplaced(
  documentId: string | null,
  reason: UnplacedBox['reason'],
  count = 1,
): UnplacedBox {
  return documentId === null
    ? { count, label: 'Caixa', reason }
    : { count, documentId, label: 'Caixa', reason }
}

describe('fila de revisão — estados (D7)', () => {
  test('o CHECK do banco e a política falam dos mesmos quatro estados, sem ENUM', () => {
    expect([...TRIP_DOCUMENT_REVIEW_STATUSES]).toEqual([
      'pending',
      'moved',
      'swapped_in',
      'relinked',
    ])
  })

  test('o motivo é o do empacotador mais a nota trocada', () => {
    expect(TRIP_DOCUMENT_REVIEW_REASONS).toContain('bedFull')
    expect(TRIP_DOCUMENT_REVIEW_REASONS).toContain('swapped_out')
  })

  test('pendente sai para movida, trocada ou revinculada', () => {
    for (const target of ['moved', 'swapped_in', 'relinked'] as const) {
      expect(checkTripDocumentReviewTransition({ from: 'pending', to: target })).toBe('apply')
    }
  })

  test('repetir a mesma saída é idempotente', () => {
    expect(checkTripDocumentReviewTransition({ from: 'moved', to: 'moved' })).toBe('unchanged')
  })

  test('entrada resolvida não troca de destino, e nada volta para pendente', () => {
    expect(() => checkTripDocumentReviewTransition({ from: 'moved', to: 'swapped_in' })).toThrow(
      TripDocumentReviewTransitionError,
    )
    expect(() => checkTripDocumentReviewTransition({ from: 'relinked', to: 'pending' })).toThrow(
      TripDocumentReviewTransitionError,
    )
    expect(() => checkTripDocumentReviewTransition({ from: 'pending', to: 'pending' })).toThrow(
      TripDocumentReviewTransitionError,
    )
  })
})

describe('quais notas saem da viagem (D7, D11)', () => {
  test('uma linha por nota, com o motivo que mais caixas deixou de fora', () => {
    const result = selectReleasableDocuments([
      unplaced('nota-a', 'bedFull', 3),
      unplaced('nota-a', 'largerThanBed', 1),
      unplaced('nota-b', 'tooMany', 2),
    ])

    expect(result.released).toEqual([
      { boxCount: 4, documentId: 'nota-a', reason: 'bedFull' },
      { boxCount: 2, documentId: 'nota-b', reason: 'tooMany' },
    ])
  })

  test('`time_budget` nunca solta nota: a planta foi cortada, não medida', () => {
    const result = selectReleasableDocuments([
      unplaced('nota-a', 'time_budget', 5),
      unplaced('nota-b', 'bedFull', 1),
      unplaced('nota-b', 'time_budget', 1),
    ])

    expect(result.released).toEqual([])
    expect(result.kept.map((entry) => entry.documentId)).toEqual(['nota-a', 'nota-b'])
  })

  test('D11: sem medida não sai da viagem — fica com o aviso para medir', () => {
    const result = selectReleasableDocuments([
      unplaced('nota-a', 'notMeasured', 2),
      unplaced('nota-a', 'bedFull', 1),
    ])

    expect(result.released).toEqual([])
    expect(result.kept).toEqual([{ documentId: 'nota-a', reason: 'notMeasured' }])
  })

  test('linha sem nota (planta antiga) não solta nada', () => {
    expect(selectReleasableDocuments([unplaced(null, 'bedFull', 9)]).released).toEqual([])
  })
})

describe('planta com hash velho (D10)', () => {
  test('o hash atual da viagem igual ao da planta passa', () => {
    expect(() =>
      assertCargoLayoutCurrent({ currentInputHash: 'abc', layoutInputHash: 'abc' }),
    ).not.toThrow()
  })

  test('hash diferente é 409: a viagem mudou depois da planta', () => {
    let caught: unknown
    try {
      assertCargoLayoutCurrent({ currentInputHash: 'novo', layoutInputHash: 'velho' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TripCargoLayoutOutdatedError)
    expect((caught as TripCargoLayoutOutdatedError).status).toBe(409)
  })
})

describe('sugestão de troca com Δ% (D10)', () => {
  const truck = { volumeM3: 20, weightKilograms: 8000 }
  const incoming = { volumeM3: 1, weightKilograms: 400 }

  test('peso da NF-e e volume das caixas viram porcentagem do caminhão', () => {
    const [suggestion] = buildSwapSuggestions({
      candidates: [
        {
          nfeDocumentId: 'nfe-out',
          nfeNumber: '10',
          tripDocumentId: 'td-out',
          volumeM3: 2,
          weightKilograms: 800,
        },
      ],
      incoming,
      truck,
    })

    expect(suggestion).toEqual({
      nfeDocumentId: 'nfe-out',
      nfeNumber: '10',
      tripDocumentId: 'td-out',
      volumeDeltaPercent: -5,
      volumeM3: 2,
      weightDeltaPercent: -5,
      weightKilograms: 800,
    })
  })

  test('primeiro as que liberam espaço bastante, da mais parecida para a menos', () => {
    const suggestions = buildSwapSuggestions({
      candidates: [
        {
          nfeDocumentId: 'grande',
          nfeNumber: '1',
          tripDocumentId: 't1',
          volumeM3: 4,
          weightKilograms: 100,
        },
        {
          nfeDocumentId: 'pequena',
          nfeNumber: '2',
          tripDocumentId: 't2',
          volumeM3: 0.5,
          weightKilograms: 100,
        },
        {
          nfeDocumentId: 'parecida',
          nfeNumber: '3',
          tripDocumentId: 't3',
          volumeM3: 1.2,
          weightKilograms: 100,
        },
      ],
      incoming,
      truck,
    })

    expect(suggestions.map((suggestion) => suggestion.nfeDocumentId)).toEqual([
      'parecida',
      'grande',
      'pequena',
    ])
  })

  test('peso ou volume desconhecido é `null`, nunca zero', () => {
    const [suggestion] = buildSwapSuggestions({
      candidates: [
        {
          nfeDocumentId: 'x',
          nfeNumber: null,
          tripDocumentId: 't',
          volumeM3: null,
          weightKilograms: null,
        },
      ],
      incoming,
      truck,
    })

    expect(suggestion?.volumeDeltaPercent).toBeNull()
    expect(suggestion?.weightDeltaPercent).toBeNull()
  })

  test('caminhão sem carga conhecida não inventa porcentagem', () => {
    const [suggestion] = buildSwapSuggestions({
      candidates: [
        {
          nfeDocumentId: 'x',
          nfeNumber: '1',
          tripDocumentId: 't',
          volumeM3: 1,
          weightKilograms: 10,
        },
      ],
      incoming,
      truck: { volumeM3: 0, weightKilograms: null },
    })

    expect(suggestion?.volumeDeltaPercent).toBeNull()
    expect(suggestion?.weightDeltaPercent).toBeNull()
  })
})
