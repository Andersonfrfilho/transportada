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

  /**
   * Spec 224: o servidor devolve a viagem terminada por 15 min com o status real, então a conclusão
   * chega em duas leituras — primeiro a mesma viagem já `completed`/`cancelled`, depois a janela
   * fecha e ela some. Nenhuma das duas é troca de tripulação.
   */
  it.each(['completed', 'cancelled'])(
    'a viagem passa a %s na leitura nova: ela segue na lista, não é aviso',
    (concludedStatus) => {
      const previousTrips = [buildTrip('trip-1', 'on_delivery_route')]
      const currentTrips = [buildTrip('trip-1', concludedStatus)]

      expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
    },
  )

  it.each(['completed', 'cancelled'])(
    'a %s sai da janela e some da lista: o status terminal já foi visto, não é aviso',
    (concludedStatus) => {
      const previousTrips = [buildTrip('trip-1', concludedStatus)]
      const currentTrips: DriverTrip[] = []

      expect(hasReassignedTrip({ currentTrips, previousTrips })).toBe(false)
    },
  )

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
