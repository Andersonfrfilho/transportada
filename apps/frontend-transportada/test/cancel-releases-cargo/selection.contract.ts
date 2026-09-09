/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { Trip, TripStatus } from '@/modules/trip/shared/trip.types'
import {
  cancellableSelection,
  isCancellable,
  pruneSelection,
  selectAllOnPage,
  selectAllState,
  toggleSelection,
} from '@/modules/trip/shared/tripSelection.service'

function trip(id: string, status: TripStatus): Trip {
  return {
    companyId: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-03T12:00:00.000Z',
    driverNames: [],
    id,
    requiresMdfe: null,
    requiresMdfeReason: null,
    status,
    updatedAt: '2026-09-03T12:00:00.000Z',
    vehicleId: '00000000-0000-4000-8000-0000000000a1',
  }
}

describe('seleção de viagens (spec 102)', () => {
  /**
   * ⚠️ `completed` é recusada por `checkTripTransition`, e oferecê-la produziria `409` no clique.
   * `cancelled` de novo é no-op — o use case devolve `unchanged` e não escreve.
   */
  it('concluída e cancelada não são canceláveis', () => {
    expect(isCancellable(trip('a', 'completed'))).toBe(false)
    expect(isCancellable(trip('b', 'cancelled'))).toBe(false)
  })

  it('rascunho, planejada e despachada são canceláveis', () => {
    for (const status of ['draft', 'route_planned', 'dispatched', 'in_transit'] as const) {
      expect(isCancellable(trip('a', status)), status).toBe(true)
    }
  })

  /** A ação age na **interseção**, nunca na marcação crua: a concluída marcada não é enviada. */
  it('a seleção efetiva descarta o que não pode ser cancelado', () => {
    const trips = [trip('a', 'draft'), trip('b', 'completed'), trip('c', 'route_planned')]

    const chosen = cancellableSelection({ selectedIds: ['a', 'b', 'c'], trips })

    expect(chosen.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('marcar e desmarcar alterna', () => {
    expect(toggleSelection({ selectedIds: [], tripId: 'a' })).toEqual(['a'])
    expect(toggleSelection({ selectedIds: ['a', 'b'], tripId: 'a' })).toEqual(['b'])
  })

  /** "Selecionar todos" é da **página**, e só do que pode ser cancelado. */
  it('selecionar todos ignora a concluída', () => {
    const trips = [trip('a', 'draft'), trip('b', 'completed')]

    expect(selectAllOnPage(trips)).toEqual(['a'])
  })

  it('o estado do cabeçalho distingue nenhum, alguns e todos', () => {
    const trips = [trip('a', 'draft'), trip('b', 'route_planned'), trip('c', 'completed')]

    expect(selectAllState({ selectedIds: [], trips })).toBe('none')
    expect(selectAllState({ selectedIds: ['a'], trips })).toBe('some')
    expect(selectAllState({ selectedIds: ['a', 'b'], trips })).toBe('all')
  })

  /** Página só de concluídas não tem o que marcar: o cabeçalho fica em `none`, nunca em `all`. */
  it('página sem viagem cancelável não fica marcada', () => {
    expect(selectAllState({ selectedIds: [], trips: [trip('a', 'completed')] })).toBe('none')
  })

  /**
   * ⚠️ Paginação por cursor troca o conjunto inteiro. Manter marcação de viagem que saiu da página
   * faria o operador cancelar o que ele não está vendo.
   */
  it('marcação de viagem fora da página é descartada', () => {
    const trips = [trip('c', 'draft')]

    expect(pruneSelection({ selectedIds: ['a', 'b', 'c'], trips })).toEqual(['c'])
  })
})
