/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  countOpenTripDocumentsForClose,
  isTripDocumentOpenForClose,
} from '../../src/modules/trip/shared/tripClose.service'
import type { TripDocument } from '../../src/modules/trip/shared/trip.types'
import { TRIP_DOCUMENT } from './trip.fixture'

function document(overrides: Partial<TripDocument> = {}): TripDocument {
  return { ...TRIP_DOCUMENT, ...overrides }
}

/**
 * Spec 156 T8c (ADR-0067), revisão do code-reviewer: a contagem da tela é a mesma regra do
 * servidor (`trip-close.policy.ts`, `drizzle-trip.repository.ts`) — `releasedAt` e
 * `separationStatus`, nunca `deliveredAt`/`returnedAt`. As duas colunas divergiam exatamente onde a
 * escrita órfã de `deliverDocument` gravava hora de entrega sem trocar o estado: uma nota
 * `separationStatus: 'pending'` com `deliveredAt` preenchido por outro caminho continuava em aberto
 * para o servidor, e a tela antiga já dava como fechada.
 */
describe('contagem de notas em aberto para o encerramento (spec 156 T8c)', () => {
  it('nota pendente está em aberto', () => {
    expect(isTripDocumentOpenForClose(document({ separationStatus: 'pending' }))).toBe(true)
  })

  it('nota separada ou carregada segue em aberto', () => {
    expect(isTripDocumentOpenForClose(document({ separationStatus: 'separated' }))).toBe(true)
    expect(isTripDocumentOpenForClose(document({ separationStatus: 'loaded' }))).toBe(true)
  })

  it('nota entregue fecha, mesmo sem releasedAt', () => {
    expect(
      isTripDocumentOpenForClose(
        document({ deliveredAt: '2026-09-19T10:00:00.000Z', separationStatus: 'delivered' }),
      ),
    ).toBe(false)
  })

  it('nota devolvida fecha', () => {
    expect(
      isTripDocumentOpenForClose(
        document({ returnedAt: '2026-09-19T10:00:00.000Z', separationStatus: 'returned' }),
      ),
    ).toBe(false)
  })

  it('nota liberada fecha mesmo com separationStatus pendente', () => {
    expect(
      isTripDocumentOpenForClose(
        document({ releasedAt: '2026-09-19T10:00:00.000Z', separationStatus: 'pending' }),
      ),
    ).toBe(false)
  })

  /**
   * O caso que a regra antiga (`deliveredAt`/`returnedAt`/`releasedAt` todos nulos) tratava
   * diferente do servidor: `separationStatus` já é `delivered`, mas `deliveredAt` nunca foi
   * carimbado por algum caminho de dado legado. Pela regra do servidor, fechada; pela regra
   * antiga da tela, ainda em aberto — é essa divergência que fazia o `reason: null` da tela
   * responder 422.
   */
  it('separationStatus manda, mesmo sem deliveredAt carimbado', () => {
    expect(
      isTripDocumentOpenForClose(document({ deliveredAt: null, separationStatus: 'delivered' })),
    ).toBe(false)
  })

  it('conta só as notas em aberto do lote', () => {
    const documents = [
      document({ id: 'doc-1', separationStatus: 'pending' }),
      document({
        deliveredAt: '2026-09-19T10:00:00.000Z',
        id: 'doc-2',
        separationStatus: 'delivered',
      }),
      document({ id: 'doc-3', releasedAt: '2026-09-19T10:00:00.000Z' }),
      document({ id: 'doc-4', separationStatus: 'loaded' }),
    ]

    expect(countOpenTripDocumentsForClose(documents)).toBe(2)
  })

  it('lote inteiro fechado conta zero', () => {
    const documents = [
      document({
        deliveredAt: '2026-09-19T10:00:00.000Z',
        id: 'doc-1',
        separationStatus: 'delivered',
      }),
      document({ id: 'doc-2', releasedAt: '2026-09-19T10:00:00.000Z' }),
    ]

    expect(countOpenTripDocumentsForClose(documents)).toBe(0)
  })
})
