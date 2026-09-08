/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A coordenada da casa do motorista, pelo mesmo provedor gratuito que o formulário já usa.
 *
 * ⚠️ **Isto não é a escalada que a ADR-0044 recusa.** Ela proíbe subir para provedor **pago** em
 * runtime, e o contrato `paid-provider-never-called.contract.ts` guarda esse caminho. Aqui é o
 * Photon, gratuito, e o padrão é o mesmo de `GET /postal-codes`: a base responde primeiro, o
 * provedor só é chamado quando ela não sabe.
 *
 * ⚠️ E **uma vez por motorista**, não por leitura: quem decide é `planDriverHomeGeocoding`, pela
 * marca de "já procurei" gravada na ficha.
 *
 * ⚠️ Do servidor o `User-Agent` sai identificável — que era exatamente a objeção da ADR-0037 ao
 * Nominatim, impossível de satisfazer no `fetch` do navegador.
 */
import type { DriverHomeCoordinate } from '../application/driver-home-geocoder.port.js'

const USER_AGENT = 'TransportAdA/1.0 (+https://adatechnology.com.br)'
const SEARCH_LIMIT = 1
const REQUEST_TIMEOUT_MS = 5_000

/** A caixa do Brasil continental, a mesma do CHECK: fora dela, a resposta é descartada. */
const LATITUDE_RANGE = { maximum: 6, minimum: -34 } as const
const LONGITUDE_RANGE = { maximum: -34, minimum: -74 } as const

export function createPhotonDriverHomeGateway(input: {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
}): Readonly<{
  search: (term: string, expectedCity: string) => Promise<DriverHomeCoordinate | null>
}> {
  const request = input.fetch ?? globalThis.fetch

  return {
    async search(term, expectedCity) {
      const url = new URL(input.baseUrl)
      url.searchParams.set('q', term)
      url.searchParams.set('limit', String(SEARCH_LIMIT))

      const response = await request(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) return null

      return readFirstCoordinate((await response.json()) as unknown, expectedCity)
    },
  }
}

/**
 * ⚠️ **GeoJSON é `[longitude, latitude]`, nesta ordem** — o inverso de como se fala. Trocar as duas
 * põe a casa de Sertãozinho no Oceano Índico, e o número continua parecendo coordenada. A caixa do
 * Brasil é o que transforma essa troca em ausência em vez de em dado errado.
 */
function readFirstCoordinate(payload: unknown, expectedCity: string): DriverHomeCoordinate | null {
  if (typeof payload !== 'object' || payload === null) return null
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return null

  const [feature] = features as readonly unknown[]
  if (typeof feature !== 'object' || feature === null) return null

  /**
   * ⚠️ **A cidade é conferida, e não é zelo teórico.** Medido em 2026-09-08 contra o Photon real,
   * com os seis motoristas desta base: "Rua Sete de Setembro, 990, Pontal, SP" voltou como
   * `-23.468, -46.527` — Guarulhos, a 250 km. O nome da rua existe em quase toda cidade do Brasil, e
   * o provedor casa a mais famosa. A coordenada é plausível, o número não tem nada de errado, e a
   * casa do motorista iria parar na Grande São Paulo.
   *
   * Divergiu, é ausência — nunca a coordenada de outro lugar. A dobra ignora acento e caixa porque
   * o cadastro escreve "Sertãozinho" e o provedor devolve "Sertaozinho".
   */
  const properties = (feature as { properties?: unknown }).properties
  if (!matchesCity(properties, expectedCity)) return null

  const geometry = (feature as { geometry?: unknown }).geometry
  if (typeof geometry !== 'object' || geometry === null) return null

  const coordinates = (geometry as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates)) return null

  const [longitude, latitude] = coordinates as readonly unknown[]
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
  if (!inRange(latitude, LATITUDE_RANGE) || !inRange(longitude, LONGITUDE_RANGE)) return null

  return { latitude: String(latitude), longitude: String(longitude) }
}

function inRange(value: number, range: { readonly maximum: number; readonly minimum: number }) {
  return Number.isFinite(value) && value >= range.minimum && value <= range.maximum
}

/** Dobra que ignora acento e caixa: o cadastro escreve `Sertãozinho`, o provedor devolve `Sertaozinho`. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

function matchesCity(properties: unknown, expectedCity: string): boolean {
  if (typeof properties !== 'object' || properties === null) return false
  const record = properties as Record<string, unknown>
  const expected = fold(expectedCity)
  if (expected === '') return false

  /** O Photon nomeia a cidade em chaves diferentes conforme o porte do lugar. */
  return ['city', 'town', 'village', 'county', 'district'].some(
    (key) => typeof record[key] === 'string' && fold(record[key]) === expected,
  )
}
