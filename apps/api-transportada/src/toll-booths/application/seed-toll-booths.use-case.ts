/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TollBoothRepository, TollBoothSeedRecord } from './toll-booth.port.js'

export type SeedTollBoothsDependencies = Readonly<{
  /** Só grava — spec 090 T7 acrescentou `readByNodeIds` ao repositório, que este caso não usa. */
  repository: Pick<TollBoothRepository, 'saveMany'>
}>

export type SeedTollBoothsResult = Readonly<{ saved: number }>

const CHUNK_SIZE = 500

/**
 * O seed da praça de pedágio (spec 090, T3) passa por aqui, e não por `INSERT` bruto: é a regra do
 * repositório, e o extract é entrada externa — nasce de `scripts/toll-booth-extract.ts` sobre um
 * `.pbf`, e uma coordenada ou tarifa corrompida entraria em base sem ninguém ver.
 *
 * ⚠️ **Praça sem tarifa não é recusada.** Ela existe na estrada mesmo sem `charge` no OSM (3 das 166
 * medidas), e descartá-la faria a rota parecer sem pedágio ali — a validação aqui é de forma
 * (número, faixa), nunca de presença.
 */
export function createSeedTollBoothsUseCase(
  dependencies: SeedTollBoothsDependencies,
): Readonly<{ save: (booths: readonly TollBoothSeedRecord[]) => Promise<SeedTollBoothsResult> }> {
  return {
    async save(booths: readonly TollBoothSeedRecord[]): Promise<SeedTollBoothsResult> {
      for (const booth of booths) assertValid(booth)

      let saved = 0
      for (let start = 0; start < booths.length; start += CHUNK_SIZE) {
        saved += await dependencies.repository.saveMany(booths.slice(start, start + CHUNK_SIZE))
      }

      return { saved }
    },
  }
}

function assertValid(booth: TollBoothSeedRecord): void {
  if (booth.osmNodeId <= 0n) {
    throw new Error(`toll booth has an invalid osm_node_id: ${booth.osmNodeId}`)
  }
  assertCoordinate(booth.osmNodeId, 'latitude', booth.latitude, 90)
  assertCoordinate(booth.osmNodeId, 'longitude', booth.longitude, 180)
  assertNonNegativeCharge(booth.osmNodeId, 'charge_per_axle', booth.chargePerAxle)
  assertNonNegativeCharge(booth.osmNodeId, 'charge_car', booth.chargeCar)
}

function assertCoordinate(osmNodeId: bigint, field: string, value: string, bound: number): void {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > bound) {
    throw new Error(`toll booth ${osmNodeId} has an invalid ${field}: ${value}`)
  }
}

function assertNonNegativeCharge(osmNodeId: bigint, field: string, value: null | string): void {
  if (value === null) return

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`toll booth ${osmNodeId} has an invalid ${field}: ${value}`)
  }
}
