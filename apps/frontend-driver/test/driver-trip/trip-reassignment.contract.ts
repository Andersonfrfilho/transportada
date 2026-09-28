import { describe, expect, it } from 'bun:test'

import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import { hasReassignedTrip } from '@/modules/driver-trip/shared/tripReassignment.service'

function buildTrip(id: string, status: string): DriverTrip {
  return { id, manifest: null, status, stops: [], vehiclePlate: 'ABC1D23' }
}

describe('hasReassignedTrip (spec 217 RF8/D6)', () => {
  it('viagem que estava no snapshot e sumiu, sem estar concluída, é reatribuição', () => {
    const previousTrips = [buildTrip('trip-1', 'in_transit')]
    const currentTrips: DriverTrip[] = []

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(true)
  })

  it('viagem devolvida a draft (troca de veículo, D3) também some sem estar concluída', () => {
    const previousTrips = [buildTrip('trip-1', 'route_planned')]
    const currentTrips: DriverTrip[] = []

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(true)
  })

  it('viagem concluída some pelo caminho normal — não é aviso', () => {
    const previousTrips = [buildTrip('trip-1', 'completed')]
    const currentTrips: DriverTrip[] = []

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
  })

  it('viagem cancelada some pelo caminho normal — não é aviso', () => {
    const previousTrips = [buildTrip('trip-1', 'cancelled')]
    const currentTrips: DriverTrip[] = []

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
  })

  it('nenhuma viagem sumiu — não é aviso', () => {
    const previousTrips = [buildTrip('trip-1', 'in_transit')]
    const currentTrips = [buildTrip('trip-1', 'in_transit')]

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
  })

  it('snapshot anterior vazio — não há o que comparar, não é aviso', () => {
    const previousTrips: DriverTrip[] = []
    const currentTrips = [buildTrip('trip-2', 'dispatched')]

    expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
  })
})
