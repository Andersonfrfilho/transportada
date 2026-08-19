/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describeErrorForLog } from '../../logging/error-descriptor.service.js'
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type {
  FleetVehicleCatalogPort,
  ListVehicleCatalogBrandsInput,
  ListVehicleCatalogModelsInput,
  VehicleCatalogResult,
} from '../application/fleet-vehicle-catalog.port.js'
import { resolveVehicleCatalogSegment } from '../domain/vehicle-catalog-segment.policy.js'

const SUCCESS_TTL_MILLISECONDS = 24 * 60 * 60 * 1000
const FAILURE_TTL_MILLISECONDS = 60 * 1000

type CacheEntry = {
  readonly expiresAt: number
  readonly result: VehicleCatalogResult
}

/** Decorador de cache em memória: TTL longo no sucesso, curto na falha — nunca deixa o erro escapar. */
export function createCachedVehicleCatalogGateway(dependencies: {
  readonly gateway: FleetVehicleCatalogPort
  readonly logger: ApiLogger
  readonly now?: () => Date
}): FleetVehicleCatalogPort {
  const cache = new Map<string, CacheEntry>()
  const now = dependencies.now ?? ((): Date => new Date())

  async function resolve(
    input: {
      readonly brand?: string
      readonly role: ListVehicleCatalogBrandsInput['role']
      readonly wheelType: ListVehicleCatalogBrandsInput['wheelType']
    },
    invoke: () => Promise<VehicleCatalogResult>,
  ): Promise<VehicleCatalogResult> {
    const segment = resolveVehicleCatalogSegment(input)
    const key = `${segment}:${input.brand ?? ''}`
    const nowMilliseconds = now().getTime()

    const cached = cache.get(key)
    if (cached !== undefined && cached.expiresAt > nowMilliseconds) return cached.result

    const result = await invoke().catch((error: unknown): VehicleCatalogResult => {
      safeLogError({
        logger: dependencies.logger,
        message: 'fleet.vehicle_catalog.fetch_failed',
        metadata: { segment, ...describeErrorForLog(error) },
      })
      return { items: [], source: 'unavailable' }
    })
    const ttl =
      result.source === 'unavailable' ? FAILURE_TTL_MILLISECONDS : SUCCESS_TTL_MILLISECONDS
    cache.set(key, { expiresAt: nowMilliseconds + ttl, result })
    return result
  }

  return {
    listBrands: (input: ListVehicleCatalogBrandsInput): Promise<VehicleCatalogResult> =>
      resolve(input, () => dependencies.gateway.listBrands(input)),

    listModels: (input: ListVehicleCatalogModelsInput): Promise<VehicleCatalogResult> =>
      resolve(input, () => dependencies.gateway.listModels(input)),
  }
}
