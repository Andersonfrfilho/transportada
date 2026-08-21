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
import { FleetVehicleCatalogFailedError } from '../domain/fleet.error.js'
import { resolveVehicleCatalogSegment } from '../domain/vehicle-catalog-segment.policy.js'

/** Marca e modelo da FIPE mudam em escala de mês; pedir a lista todo dia é rede paga à toa. */
const DEFAULT_SUCCESS_TTL_MILLISECONDS = 30 * 24 * 60 * 60 * 1000
const FAILURE_TTL_MILLISECONDS = 60 * 1000

type CacheEntry = {
  readonly expiresAt: number
  readonly result: VehicleCatalogResult
}

type FailureMetadata = {
  readonly failure?: string
  readonly providerStatus?: number
}

/** Decorador de cache em memória: janela longa no sucesso, curta na falha — o erro nunca escapa. */
export function createCachedVehicleCatalogGateway(dependencies: {
  readonly gateway: FleetVehicleCatalogPort
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly successTtlMilliseconds?: number
}): FleetVehicleCatalogPort {
  const cache = new Map<string, CacheEntry>()
  // Guardado à parte e sem prazo: é ele que cobre o piscar do provedor depois da janela vencer.
  const lastSuccess = new Map<string, VehicleCatalogResult>()
  const now = dependencies.now ?? ((): Date => new Date())
  const successTtl = dependencies.successTtlMilliseconds ?? DEFAULT_SUCCESS_TTL_MILLISECONDS

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

    let hasFailed = false
    const result = await invoke().catch((error: unknown): VehicleCatalogResult => {
      hasFailed = true
      // Lista velha vale mais que lista vazia: a tela do operador não perde as marcas por um piscar.
      const stale = lastSuccess.get(key)
      safeLogError({
        logger: dependencies.logger,
        message: 'fleet.vehicle_catalog.fetch_failed',
        metadata: {
          segment,
          servedStale: stale !== undefined,
          ...describeFailure(error),
          ...describeErrorForLog(error),
        },
      })
      return stale ?? { items: [], source: 'unavailable' }
    })

    if (!hasFailed && result.source !== 'unavailable') lastSuccess.set(key, result)
    // A resposta velha vale pelos mesmos 60 segundos da falha: passou isso, o provedor é tentado de novo.
    const ttl = hasFailed || result.source === 'unavailable' ? FAILURE_TTL_MILLISECONDS : successTtl
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

function describeFailure(error: unknown): FailureMetadata {
  if (!(error instanceof FleetVehicleCatalogFailedError)) return {}
  return {
    failure: error.failure,
    ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
  }
}
