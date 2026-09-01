/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createSaveMunicipalityCentroidsUseCase } from '../../src/routing/application/save-municipality-centroids.use-case.js'
import type {
  MunicipalityCentroid,
  MunicipalityCentroidRepository,
} from '../../src/routing/application/municipality-centroid.port.js'

const RIBEIRAO_PRETO: MunicipalityCentroid = {
  cityCode: '3543402',
  latitude: '-21.2138406',
  longitude: '-47.8218619',
  state: 'SP',
}

function repositoryRecording(batches: MunicipalityCentroid[][]): MunicipalityCentroidRepository {
  return {
    async saveMany(centroids) {
      batches.push([...centroids])

      return centroids.length
    },
  }
}

describe('municipality centroid seed (spec 069, T007)', () => {
  test('saves every centroid it is given', async () => {
    const batches: MunicipalityCentroid[][] = []
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording(batches),
    })

    expect(await useCase.save([RIBEIRAO_PRETO])).toEqual({ saved: 1 })
  })

  /** 5.570 linhas num `insert` só estouram o limite de parâmetros do Postgres. */
  test('splits a nationwide load into batches', async () => {
    const batches: MunicipalityCentroid[][] = []
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording(batches),
    })
    const many = Array.from({ length: 1200 }, (_unused, index) => ({
      ...RIBEIRAO_PRETO,
      cityCode: String(3_000_000 + index),
    }))

    expect(await useCase.save(many)).toEqual({ saved: 1200 })
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 200])
  })

  /**
   * O arquivo é entrada externa: nasce de um script sobre a malha do IBGE, e município sem geometria
   * sairia de lá com coordenada vazia. Validar na fronteira é o que impede uma coordenada trocada de
   * sinal entrar em base sem ninguém ver — num carregamento de 5.570 linhas ninguém confere à mão.
   */
  test('refuses a coordinate outside the earth', async () => {
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording([]),
    })

    expect(useCase.save([{ ...RIBEIRAO_PRETO, latitude: '-921.2138406' }])).rejects.toThrow(
      'invalid latitude',
    )
  })

  test('refuses a city code that is not seven digits', async () => {
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording([]),
    })

    expect(useCase.save([{ ...RIBEIRAO_PRETO, cityCode: '35434' }])).rejects.toThrow(
      'invalid city code',
    )
  })

  test('refuses a state that is not a two-letter code', async () => {
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording([]),
    })

    expect(useCase.save([{ ...RIBEIRAO_PRETO, state: 'sp' }])).rejects.toThrow('invalid state')
  })

  /** Nada é gravado se **alguma** linha do lote for inválida: meia base é pior que base nenhuma. */
  test('writes nothing when any row in the load is invalid', async () => {
    const batches: MunicipalityCentroid[][] = []
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: repositoryRecording(batches),
    })

    await useCase
      .save([RIBEIRAO_PRETO, { ...RIBEIRAO_PRETO, cityCode: 'x' }])
      .catch(() => undefined)

    expect(batches).toEqual([])
  })
})
