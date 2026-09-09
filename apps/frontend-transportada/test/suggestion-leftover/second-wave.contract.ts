/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveFreeingVehicles } from '@/modules/routing/shared/suggestionSecondWave.service'

const PLATES = new Map([
  ['vehicle-1', 'RTD5J78'],
  ['vehicle-2', 'ABC1D23'],
])

describe('a segunda onda (spec 107 D3)', () => {
  /**
   * ⚠️ **O primeiro a ficar livre é o que interessa.** A ordem em que o aceite criou as viagens é a
   * ordem dos veículos ofertados, e ela não tem relação nenhuma com quem termina antes — imprimir a
   * primeira da lista mandaria o operador esperar o caminhão errado.
   */
  test('ordena pelo término, não pela ordem em que as viagens nasceram', () => {
    const freeing = resolveFreeingVehicles({
      plateByVehicleId: PLATES,
      trips: [
        {
          estimatedFinishAt: '2026-09-09T19:30:00.000Z',
          tripId: 'trip-1',
          vehicleId: 'vehicle-1',
        },
        {
          estimatedFinishAt: '2026-09-09T17:00:00.000Z',
          tripId: 'trip-2',
          vehicleId: 'vehicle-2',
        },
      ],
    })

    expect(freeing.map((entry) => entry.plate)).toEqual(['ABC1D23', 'RTD5J78'])
  })

  /**
   * ⚠️ Viagem sem ETA **sai da lista**, e não entra como "termina em algum momento": a frase existe
   * para dizer uma hora, e uma linha sem hora só ocuparia o lugar de quem tem uma.
   */
  test('viagem sem término não vira linha', () => {
    const freeing = resolveFreeingVehicles({
      plateByVehicleId: PLATES,
      trips: [{ estimatedFinishAt: null, tripId: 'trip-1', vehicleId: 'vehicle-1' }],
    })

    expect(freeing).toEqual([])
  })

  /**
   * ⚠️ Placa desconhecida **não some**: o veículo cadastrado depois da consulta da frota, ou a frota
   * ainda carregando, deixariam o operador sem a única linha que diz quando o caminhão volta.
   * Sem placa a linha sai sem ela, e é a tela que decide como nomeá-la.
   */
  test('veículo sem placa conhecida continua na lista', () => {
    const freeing = resolveFreeingVehicles({
      plateByVehicleId: new Map(),
      trips: [
        {
          estimatedFinishAt: '2026-09-09T17:00:00.000Z',
          tripId: 'trip-1',
          vehicleId: 'vehicle-1',
        },
      ],
    })

    expect(freeing).toEqual([
      {
        estimatedFinishAt: '2026-09-09T17:00:00.000Z',
        plate: null,
        tripId: 'trip-1',
        vehicleId: 'vehicle-1',
      },
    ])
  })
})
