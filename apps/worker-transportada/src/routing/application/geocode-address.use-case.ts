/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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

/**
 * O centroide de município — o **último** degrau, quando nem o CEP resolve.
 *
 * ⚠️ Ele já teve um vizinho, `byPostalCode`, e a inversão da cascata (adendo 2026-09-01 da ADR-0044)
 * o tornou redundante: o degrau do CEP virou o **primário**, servido pela BrasilAPI através de
 * `GeocodingPort`, e um segundo slot de centroide por CEP ficaria vazio para sempre. Slot que
 * ninguém preenche é estrutura morta que o próximo leitor tenta entender.
 */
export type CentroidPort = Readonly<{
  byCityCode: (cityCode: string) => Promise<Omit<GeocodedAddressRecord, 'addressKey'> | null>
}>

export type GeocodeAddressesDependencies = Readonly<{
  cache?: GeocodingHotCache
  centroids: CentroidPort
  geocoding: GeocodingPort
  repository: GeocodedAddressRepository
}>

/**
 * A métrica de volume da ADR-0044 §3, mitigação 3 — e ela é **por origem**, não um número só.
 *
 * ⚠️ Antes daqui o campo era `geocodedCount`, contando apenas `source === 'google'`. Com a inversão
 * da cascata (adendo 2026-09-01) o worker nunca chama provedor pago, então esse número seria zero
 * para sempre: uma métrica que reporta silêncio enquanto a base cresce.
 *
 * `fromBase` é o que **não custou nada** por já estar guardado; `unresolved` é o endereço que nenhum
 * degrau resolveu, e que deixa a parada sem coordenada.
 */
export type GeocodeAddressesResult = Readonly<{
  byAddressKey: ReadonlyMap<string, GeocodedAddressRecord>
  counts: Readonly<{
    fromBase: number
    resolvedByCity: number
    resolvedByPostalCode: number
    unresolved: number
  }>
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
  const pending = new Map<string, GeocodeAddressRequest>()

  for (const request of requests) {
    const cached = dependencies.cache?.get(request.addressKey)
    if (cached !== undefined) {
      byAddressKey.set(request.addressKey, cached)
      continue
    }
    /**
     * RF1: o mesmo endereço em cem notas é **uma** chamada, não cem. A deduplicação vive aqui e não
     * em cada chamador porque são dois — a sugestão e a rotina de população —, e o segundo a esquecer
     * pagaria a conta calado.
     */
    pending.set(request.addressKey, request)
  }

  const stored = await readStored(dependencies, [...pending.values()])
  for (const record of stored) {
    byAddressKey.set(record.addressKey, record)
    dependencies.cache?.set(record)
  }

  const missing = [...pending.values()].filter((request) => !byAddressKey.has(request.addressKey))
  const fromBase = pending.size - missing.length
  let resolvedByPostalCode = 0
  let resolvedByCity = 0
  let unresolved = 0

  for (const request of missing) {
    const resolved = await resolveThroughCascade(dependencies, request)
    if (resolved === null) {
      unresolved += 1
      continue
    }

    const record: GeocodedAddressRecord = { ...resolved, addressKey: request.addressKey }
    await dependencies.repository.save(record)
    dependencies.cache?.set(record)
    byAddressKey.set(request.addressKey, record)
    if (record.source === 'city') resolvedByCity += 1
    else resolvedByPostalCode += 1
  }

  return { byAddressKey, counts: { fromBase, resolvedByCity, resolvedByPostalCode, unresolved } }
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
   * Dois degraus, e não os quatro da ADR-0044 §3 original: o provedor pago saiu daqui e virou
   * escalada por marca humana, na API (adendo 2026-09-01). O que sobra no worker é o CEP — de graça,
   * primário — e o município como queda.
   *
   * Queda do provedor de CEP não derruba a sugestão: os endereços já em base seguem, e os novos
   * descem ao município — que entra marcado e fora da otimização (ADR-0044 §5).
   */
  const geocoded = await dependencies.geocoding.geocode(request).catch(() => null)
  if (geocoded !== null) return geocoded

  return dependencies.centroids.byCityCode(request.cityCode)
}
