/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { TRIP_STATUS, type Trip, type TripStatus } from '@/modules/trip/shared/trip.types'
import { closeableSelection, isCloseable } from '@/modules/trip/shared/tripSelection.service'

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

describe('seleção de encerramento em massa (spec 223 RF8)', () => {
  /**
   * As duas recusas do detalhe (`TripDetail`: `!isCompleted && status !== 'cancelled'`) valem igual
   * na lista — oferecer o botão nelas daria `409` no clique.
   */
  it('não oferece encerramento para viagem concluída nem cancelada', () => {
    expect(isCloseable(trip('a', 'completed'))).toBe(false)
    expect(isCloseable(trip('b', 'cancelled'))).toBe(false)
  })

  it('oferece encerramento para todo o resto do vocabulário de status', () => {
    for (const status of TRIP_STATUS) {
      if (status === 'completed' || status === 'cancelled') continue
      expect(isCloseable(trip('a', status)), status).toBe(true)
    }
  })

  it('cruza a marcação com o que pode encerrar, nunca a marcação crua', () => {
    const trips = [trip('a', 'in_transit'), trip('b', 'completed'), trip('c', 'on_delivery_route')]

    const chosen = closeableSelection({ selectedIds: ['a', 'b', 'c'], trips })

    expect(chosen.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('ignora id marcado que não está na página', () => {
    const chosen = closeableSelection({ selectedIds: ['a', 'fora'], trips: [trip('a', 'loading')] })

    expect(chosen.map((item) => item.id)).toEqual(['a'])
  })
})
