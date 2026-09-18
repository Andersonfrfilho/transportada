/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { isTripOnTheRoad, TRIP_ON_THE_ROAD_REFETCH_MS } from '@/modules/trip/shared/trip.constant'

describe('o escritório vê a viagem andar', () => {
  /** Só na rua: repetir a consulta numa viagem em rascunho é bater no servidor por nada. */
  /**
   * Spec 156 T15: a primeira nota fechada leva a viagem a `on_delivery_route` (ADR-0058 §3) — é
   * justamente enquanto o motorista entrega o resto que o painel precisa continuar consultando.
   */
  it('repete a consulta nas três fases em que o motorista reporta', () => {
    expect(isTripOnTheRoad('dispatched')).toBe(true)
    expect(isTripOnTheRoad('in_transit')).toBe(true)
    expect(isTripOnTheRoad('on_delivery_route')).toBe(true)

    for (const status of [
      'draft',
      'route_planned',
      'separating',
      'loading',
      'completed',
      'cancelled',
    ]) {
      expect(isTripOnTheRoad(status)).toBe(false)
    }
  })

  it('viagem ainda não carregada não repete consulta nenhuma', () => {
    expect(isTripOnTheRoad(undefined)).toBe(false)
  })

  /** Meio minuto é o que separa "acompanhar" de "ficar batendo no servidor". */
  it('o intervalo é de meio minuto', () => {
    expect(TRIP_ON_THE_ROAD_REFETCH_MS).toBe(30_000)
  })
})
