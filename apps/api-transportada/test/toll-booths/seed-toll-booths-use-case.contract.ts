/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  TollBoothRepository,
  TollBoothSeedRecord,
} from '../../src/toll-booths/application/toll-booth.port.js'
import { createSeedTollBoothsUseCase } from '../../src/toll-booths/application/seed-toll-booths.use-case.js'

const NOVA_ODESSA: TollBoothSeedRecord = {
  chargeCar: '12.80',
  chargePerAxle: '12.80',
  latitude: '-22.7706642',
  longitude: '-47.2387170',
  name: 'Pedágio Nova Odessa (sentido Norte)',
  observedOn: '2026-09-07',
  operator: 'CCR AutoBAn',
  osmNodeId: 33554488n,
}

function repositoryRecording(
  batches: TollBoothSeedRecord[][],
): Pick<TollBoothRepository, 'saveMany'> {
  return {
    async saveMany(booths) {
      batches.push([...booths])

      return booths.length
    },
  }
}

describe('seed toll booths use case (spec 090, T3)', () => {
  test('salva cada praça que recebe', async () => {
    const batches: TollBoothSeedRecord[][] = []
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording(batches) })

    expect(await useCase.save([NOVA_ODESSA])).toEqual({ saved: 1 })
  })

  /** O extract inteiro (166 praças) num insert só é ok, mas o seam segue o mesmo molde do de município. */
  test('divide um lote grande em pacotes', async () => {
    const batches: TollBoothSeedRecord[][] = []
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording(batches) })
    const many = Array.from({ length: 1200 }, (_unused, index) => ({
      ...NOVA_ODESSA,
      osmNodeId: BigInt(1_000_000 + index),
    }))

    expect(await useCase.save(many)).toEqual({ saved: 1200 })
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 200])
  })

  /** Praça sem `charge` no mapa entra assim mesmo — descartá-la faria a rota parecer sem pedágio ali. */
  test('praca sem tarifa nenhuma nao e recusada', async () => {
    const batches: TollBoothSeedRecord[][] = []
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording(batches) })
    const bare: TollBoothSeedRecord = {
      ...NOVA_ODESSA,
      chargeCar: null,
      chargePerAxle: null,
      name: null,
      operator: null,
    }

    expect(await useCase.save([bare])).toEqual({ saved: 1 })
  })

  test('recusa id de no que nao e positivo', async () => {
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording([]) })

    await expect(useCase.save([{ ...NOVA_ODESSA, osmNodeId: 0n }])).rejects.toThrow(/osm_node_id/u)
  })

  test('recusa coordenada fora do planeta', async () => {
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording([]) })

    await expect(useCase.save([{ ...NOVA_ODESSA, latitude: '200' }])).rejects.toThrow(/latitude/u)
    await expect(useCase.save([{ ...NOVA_ODESSA, longitude: '-200' }])).rejects.toThrow(
      /longitude/u,
    )
  })

  test('recusa tarifa negativa', async () => {
    const useCase = createSeedTollBoothsUseCase({ repository: repositoryRecording([]) })

    await expect(useCase.save([{ ...NOVA_ODESSA, chargePerAxle: '-1' }])).rejects.toThrow(
      /charge_per_axle/u,
    )
    await expect(useCase.save([{ ...NOVA_ODESSA, chargeCar: '-1' }])).rejects.toThrow(/charge_car/u)
  })
})
