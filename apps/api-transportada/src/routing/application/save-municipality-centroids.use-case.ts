/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  MunicipalityCentroid,
  MunicipalityCentroidRepository,
} from './municipality-centroid.port.js'

export type SaveMunicipalityCentroidsDependencies = Readonly<{
  repository: MunicipalityCentroidRepository
}>

export type SaveMunicipalityCentroidsResult = Readonly<{ saved: number }>

const CITY_CODE_PATTERN = /^[0-9]{7}$/u
const STATE_PATTERN = /^[A-Z]{2}$/u
const CHUNK_SIZE = 500

/**
 * O seed do último degrau da cascata (adendo 2026-09-01 da ADR-0044) passa por aqui, e não por
 * `INSERT` bruto: é a regra do repositório, e ela paga justamente num carregamento de 5.570 linhas,
 * onde uma coordenada trocada de sinal entraria em base sem ninguém ver.
 *
 * A validação é de fronteira porque o arquivo é entrada externa — ele nasce de um script sobre a
 * malha do IBGE, e um município sem geometria sairia de lá com coordenada vazia.
 */
export function createSaveMunicipalityCentroidsUseCase(
  dependencies: SaveMunicipalityCentroidsDependencies,
) {
  return {
    async save(
      centroids: readonly MunicipalityCentroid[],
    ): Promise<SaveMunicipalityCentroidsResult> {
      for (const centroid of centroids) assertValid(centroid)

      let saved = 0
      /** Em lotes: 5.570 linhas num `insert` só estouram o limite de parâmetros do Postgres. */
      for (let start = 0; start < centroids.length; start += CHUNK_SIZE) {
        saved += await dependencies.repository.saveMany(centroids.slice(start, start + CHUNK_SIZE))
      }

      return { saved }
    },
  }
}

function assertValid(centroid: MunicipalityCentroid): void {
  if (!CITY_CODE_PATTERN.test(centroid.cityCode)) {
    throw new Error(`Municipality centroid has an invalid city code: ${centroid.cityCode}`)
  }
  if (!STATE_PATTERN.test(centroid.state)) {
    throw new Error(`Municipality centroid ${centroid.cityCode} has an invalid state`)
  }
  assertCoordinate(centroid.cityCode, 'latitude', centroid.latitude, 90)
  assertCoordinate(centroid.cityCode, 'longitude', centroid.longitude, 180)
}

function assertCoordinate(cityCode: string, field: string, value: string, bound: number): void {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > bound) {
    throw new Error(`Municipality centroid ${cityCode} has an invalid ${field}: ${value}`)
  }
}
