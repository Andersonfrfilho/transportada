/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import { isFinerPrecision } from '../domain/geocoding-precision.policy.js'
import type {
  GeocodeAddressRequest,
  GeocodedAddressRecord,
  GeocodedAddressRepository,
  GeocodingPort,
} from './geocoding.port.js'

/**
 * A camada quente da ADR-0044 §3. Ela atende a rajada de uma sugestão sem tocar o banco, e **pode
 * ser descartada a qualquer momento sem consequência** — essa é a definição de ela estar certa, e é
 * teste de aceite: esvaziá-la não dispara geocodificação nova.
 */
export type GeocodingHotCache = Readonly<{
  get: (addressKey: string) => GeocodedAddressRecord | undefined
  set: (record: GeocodedAddressRecord) => void
}>

/** Centroide por CEP e por município — os degraus 3 e 4 da cascata, quando o provedor não resolve. */
export type CentroidPort = Readonly<{
  byCityCode: (cityCode: string) => Promise<Omit<GeocodedAddressRecord, 'addressKey'> | null>
  byPostalCode: (postalCode: string) => Promise<Omit<GeocodedAddressRecord, 'addressKey'> | null>
}>

export type GeocodeAddressesDependencies = Readonly<{
  cache?: GeocodingHotCache
  centroids: CentroidPort
  geocoding: GeocodingPort
  repository: GeocodedAddressRepository
}>

export type GeocodeAddressesResult = Readonly<{
  byAddressKey: ReadonlyMap<string, GeocodedAddressRecord>
  /** Quantos endereços novos esta chamada geocodificou — a métrica de volume da ADR-0044 §3. */
  geocodedCount: number
}>

/**
 * Resolve um lote de endereços em coordenada, na cascata da ADR-0044 §3:
 *
 * 1. correção manual já em base — **sempre vence**, é o trabalho que o produto pediu ao humano em
 *    troca de não pedir de novo;
 * 2. o que já está em `geocoded_addresses` (endereço já visto nunca é geocodificado de novo);
 * 3. o geocodificador de logradouro+número;
 * 4. centroide do CEP;
 * 5. centroide do município.
 *
 * O que não resolve em nenhum degrau simplesmente não entra no mapa de saída — quem chama trata a
 * parada como sem coordenada, e ela fica fora da otimização em vez de entrar com um palpite.
 */
export async function geocodeAddresses(
  dependencies: GeocodeAddressesDependencies,
  requests: readonly GeocodeAddressRequest[],
): Promise<GeocodeAddressesResult> {
  const byAddressKey = new Map<string, GeocodedAddressRecord>()
  const pending: GeocodeAddressRequest[] = []

  for (const request of requests) {
    const cached = dependencies.cache?.get(request.addressKey)
    if (cached === undefined) pending.push(request)
    else byAddressKey.set(request.addressKey, cached)
  }

  const stored = await readStored(dependencies, pending)
  for (const record of stored) {
    byAddressKey.set(record.addressKey, record)
    dependencies.cache?.set(record)
  }

  const missing = pending.filter((request) => !byAddressKey.has(request.addressKey))
  let geocodedCount = 0

  for (const request of missing) {
    const resolved = await resolveThroughCascade(dependencies, request)
    if (resolved === null) continue

    const record: GeocodedAddressRecord = { ...resolved, addressKey: request.addressKey }
    await dependencies.repository.save(record)
    dependencies.cache?.set(record)
    byAddressKey.set(request.addressKey, record)
    if (record.source === 'google') geocodedCount += 1
  }

  return { byAddressKey, geocodedCount }
}

async function readStored(
  dependencies: GeocodeAddressesDependencies,
  pending: readonly GeocodeAddressRequest[],
): Promise<readonly GeocodedAddressRecord[]> {
  if (pending.length === 0) return []

  return dependencies.repository.findByKeys(pending.map((request) => request.addressKey))
}

async function resolveThroughCascade(
  dependencies: GeocodeAddressesDependencies,
  request: GeocodeAddressRequest,
): Promise<Omit<GeocodedAddressRecord, 'addressKey'> | null> {
  /**
   * Queda do geocodificador não derruba a sugestão: os endereços já em cache seguem, e os novos
   * descem a cascata até o município — que entra marcado e fora da otimização (ADR-0044 §5).
   */
  const geocoded = await dependencies.geocoding.geocode(request).catch(() => null)
  if (geocoded !== null) return geocoded

  const byPostalCode = await dependencies.centroids.byPostalCode(request.postalCode)
  if (byPostalCode !== null) return byPostalCode

  return dependencies.centroids.byCityCode(request.cityCode)
}

/**
 * ADR-0044 §3: a correção manual sempre vence, e nenhuma geocodificação posterior a desfaz. Fora
 * dela, só uma precisão mais fina substitui a que já está em base — regeocodificar um telhado para
 * um centroide seria piorar o cadastro com uma escrita.
 */
export function shouldReplaceStored(input: {
  readonly candidatePrecision: GeocodingPrecision
  readonly candidateSource: GeocodedAddressRecord['source']
  readonly storedPrecision: GeocodingPrecision
  readonly storedSource: GeocodedAddressRecord['source']
}): boolean {
  if (input.storedSource === 'manual') return false
  if (input.candidateSource === 'manual') return true

  return isFinerPrecision(input.candidatePrecision, input.storedPrecision)
}
