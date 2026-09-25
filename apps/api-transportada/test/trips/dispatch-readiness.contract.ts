/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 (RF1): a conta de "carga fechada" é uma função pura só, usada pelo despacho automático e
 * pelo botão "Despachar" — este arquivo cobre a tabela de casos do plan.md D1.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDispatchReadiness } from '../../src/trips/domain/dispatch-readiness.policy.js'
import type { DispatchReadinessDocument } from '../../src/trips/domain/dispatch-readiness.policy.js'

function document(
  overrides: Partial<DispatchReadinessDocument> & { readonly tripDocumentId: string },
): DispatchReadinessDocument {
  return {
    isReleased: false,
    leavesBehindOccurrenceTypeName: null,
    separationStatus: 'loaded',
    ...overrides,
  }
}

describe('resolveDispatchReadiness — a conta da carga fechada', () => {
  test('tudo loaded fecha a carga', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({ tripDocumentId: 'doc-1', separationStatus: 'loaded' }),
        document({ tripDocumentId: 'doc-2', separationStatus: 'loaded' }),
      ],
    })

    expect(result.isCargoClosed).toBe(true)
    expect(result.leftBehind).toEqual([])
    expect(result.toLoad).toEqual([])
  })

  test('uma nota separated não fecha e aparece em toLoad', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({ tripDocumentId: 'doc-1', separationStatus: 'loaded' }),
        document({ tripDocumentId: 'doc-2', separationStatus: 'separated' }),
      ],
    })

    expect(result.isCargoClosed).toBe(false)
    expect(result.toLoad).toEqual([{ tripDocumentId: 'doc-2', separationStatus: 'separated' }])
    expect(result.leftBehind).toEqual([])
  })

  test('nota liberada ou devolvida não impede o fechamento', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({ tripDocumentId: 'doc-1', separationStatus: 'loaded' }),
        document({ tripDocumentId: 'doc-2', separationStatus: 'pending', isReleased: true }),
        document({ tripDocumentId: 'doc-3', separationStatus: 'returned' }),
      ],
    })

    expect(result.isCargoClosed).toBe(true)
    expect(result.toLoad).toEqual([])
    expect(result.leftBehind).toEqual([])
  })

  test('pendente com ocorrência "segue sem" vai para leftBehind e fecha havendo ao menos uma loaded', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({ tripDocumentId: 'doc-1', separationStatus: 'loaded' }),
        document({
          tripDocumentId: 'doc-2',
          separationStatus: 'pending',
          leavesBehindOccurrenceTypeName: 'Item faltante',
        }),
      ],
    })

    expect(result.isCargoClosed).toBe(true)
    expect(result.leftBehind).toEqual([
      { tripDocumentId: 'doc-2', occurrenceTypeName: 'Item faltante' },
    ])
    expect(result.toLoad).toEqual([])
  })

  test('loaded com ocorrência "segue sem" continua carga, não vai para leftBehind', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({
          tripDocumentId: 'doc-1',
          separationStatus: 'loaded',
          leavesBehindOccurrenceTypeName: 'Item faltante',
        }),
      ],
    })

    expect(result.isCargoClosed).toBe(true)
    expect(result.leftBehind).toEqual([])
    expect(result.toLoad).toEqual([])
  })

  test('só notas deixadas para trás não fecha a viagem', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({
          tripDocumentId: 'doc-1',
          separationStatus: 'pending',
          leavesBehindOccurrenceTypeName: 'Item faltante',
        }),
      ],
    })

    expect(result.isCargoClosed).toBe(false)
    expect(result.leftBehind).toEqual([
      { tripDocumentId: 'doc-1', occurrenceTypeName: 'Item faltante' },
    ])
    expect(result.toLoad).toEqual([])
  })

  test('lista vazia não fecha a viagem', () => {
    const result = resolveDispatchReadiness({ documents: [] })

    expect(result.isCargoClosed).toBe(false)
    expect(result.leftBehind).toEqual([])
    expect(result.toLoad).toEqual([])
  })

  test('a ordem de saída preserva a ordem de entrada', () => {
    const result = resolveDispatchReadiness({
      documents: [
        document({ tripDocumentId: 'doc-3', separationStatus: 'separated' }),
        document({
          tripDocumentId: 'doc-2',
          separationStatus: 'pending',
          leavesBehindOccurrenceTypeName: 'Item faltante',
        }),
        document({ tripDocumentId: 'doc-1', separationStatus: 'pending' }),
      ],
    })

    expect(result.toLoad).toEqual([
      { tripDocumentId: 'doc-3', separationStatus: 'separated' },
      { tripDocumentId: 'doc-1', separationStatus: 'pending' },
    ])
    expect(result.leftBehind).toEqual([
      { tripDocumentId: 'doc-2', occurrenceTypeName: 'Item faltante' },
    ])
  })
})
