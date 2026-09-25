/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverTrip, DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  describeTripSelectorPath,
  resolveSelectedTrip,
} from '@/modules/driver-trip/shared/driverTripSelection.service'

function buildTrip(id: string, status: string, stops: readonly DriverTripStop[] = []): DriverTrip {
  return { id, manifest: null, status, stops, vehiclePlate: `PLACA-${id}` }
}

function buildStop(label: string, sequence = 1): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: `stop-${sequence}`,
    label,
    latitude: null,
    longitude: null,
    schedule: null,
    sequence,
  }
}

/**
 * ADR-0075 §8, RF12: a API devolve as viagens em `createdAt` ascendente, e a tela mostrava
 * `trips[0]` — o agregado com duas viagens ativas só enxergava a primeira. A viagem padrão é a mais
 * antiga **em rota** (`in_transit` ou `on_delivery_route`); sem nenhuma em rota, a mais antiga da
 * lista, na ordem em que a API mandou.
 */
describe('qual viagem a tela mostra (spec 189 T7.1)', () => {
  it('com uma viagem só, é ela', () => {
    const only = buildTrip('a', 'route_planned')

    expect(resolveSelectedTrip({ selectedTripId: undefined, trips: [only] })).toBe(only)
  })

  it('com duas, a que está em rota vence a mais antiga parada', () => {
    const planned = buildTrip('a', 'route_planned')
    const onRoute = buildTrip('b', 'in_transit')

    expect(resolveSelectedTrip({ selectedTripId: undefined, trips: [planned, onRoute] })).toBe(
      onRoute,
    )
  })

  it('com duas em rota, a mais antiga', () => {
    const older = buildTrip('a', 'on_delivery_route')
    const newer = buildTrip('b', 'in_transit')

    expect(resolveSelectedTrip({ selectedTripId: undefined, trips: [older, newer] })).toBe(older)
  })

  it('sem nenhuma em rota, a mais antiga da lista', () => {
    const older = buildTrip('a', 'route_planned')
    const newer = buildTrip('b', 'dispatched')

    expect(resolveSelectedTrip({ selectedTripId: undefined, trips: [older, newer] })).toBe(older)
  })

  it('a escolha do motorista vale enquanto a viagem estiver na lista', () => {
    const onRoute = buildTrip('a', 'in_transit')
    const chosen = buildTrip('b', 'route_planned')

    expect(resolveSelectedTrip({ selectedTripId: 'b', trips: [onRoute, chosen] })).toBe(chosen)
  })

  /** A viagem escolhida fechou ou saiu do motorista: a tela volta ao padrão, nunca fica vazia. */
  it('a escolhida sumiu da lista: volta à padrão', () => {
    const planned = buildTrip('a', 'route_planned')
    const onRoute = buildTrip('b', 'in_transit')

    expect(resolveSelectedTrip({ selectedTripId: 'gone', trips: [planned, onRoute] })).toBe(onRoute)
  })

  it('sem viagem nenhuma, nada', () => {
    expect(resolveSelectedTrip({ selectedTripId: 'gone', trips: [] })).toBeUndefined()
  })
})

/**
 * Spec 189 T7.2 (revisão): o botão do seletor diz para onde a viagem vai, não a posição dela na
 * lista — "Viagem 1"/"Viagem 2" não dizia nada sobre o trajeto, e duas viagens podem ter a mesma
 * placa.
 */
describe('o caminho que o seletor de viagens mostra', () => {
  it('com uma parada só, o caminho é ela mesma', () => {
    const trip = buildTrip('a', 'in_transit', [buildStop('Praca da Se, 100')])

    expect(describeTripSelectorPath(trip)).toEqual({ path: 'Praca da Se, 100', stopCount: 1 })
  })

  it('com mais de uma parada, a primeira e a última — o meio fica implícito na contagem', () => {
    const trip = buildTrip('a', 'in_transit', [
      buildStop('Praca da Se, 100', 1),
      buildStop('Rua Augusta, 500', 2),
      buildStop('Av. Paulista, 900', 3),
    ])

    expect(describeTripSelectorPath(trip)).toEqual({
      path: 'Praca da Se, 100 → Av. Paulista, 900',
      stopCount: 3,
    })
  })

  it('rótulo com " — " usa só a parte antes do traço, para ficar curto', () => {
    const trip = buildTrip('a', 'in_transit', [
      buildStop('Praca da Se, 100 — portaria 2', 1),
      buildStop('Rua Augusta, 500 — retirar no balcão', 2),
    ])

    expect(describeTripSelectorPath(trip)).toEqual({
      path: 'Praca da Se, 100 → Rua Augusta, 500',
      stopCount: 2,
    })
  })

  it('sem parada nenhuma, caminho vazio', () => {
    expect(describeTripSelectorPath(buildTrip('a', 'in_transit', []))).toEqual({
      path: '',
      stopCount: 0,
    })
  })
})
