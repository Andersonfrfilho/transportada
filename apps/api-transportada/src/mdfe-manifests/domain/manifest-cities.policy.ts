/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolvePhysicalDestination } from '../../nfe-documents/domain/physical-destination.policy.js'

export type CityLocation = {
  readonly cityCode: string | null
  readonly cityName: string | null
  readonly state: string | null
}

export type ManifestCityRow = {
  readonly city: string | null
  readonly cityCode: string | null
  readonly documentId: string
  readonly number: string | null
  readonly postalCode: string | null
  readonly role: string
  readonly state: string | null
}

export type ManifestCities = {
  readonly discharge: CityLocation
  readonly origin: CityLocation
}

const ORIGIN_ROLE = 'emitter'
const EMPTY_CITY: CityLocation = { cityCode: null, cityName: null, state: null }

function toLocation(row: ManifestCityRow): CityLocation {
  return { cityCode: row.cityCode, cityName: row.city, state: row.state }
}

/**
 * Spec 073 RF6: o `cMunDescarga` é o município **da descarga**, e quando a nota traz `<entrega>` a
 * descarga é lá — o cadastro do cliente responde outra pergunta. A origem é sempre o emitente:
 * `<entrega>` não tem nada a dizer sobre de onde a carga sai.
 *
 * Puro de propósito: este é o único consumidor da spec cujo erro sai no XML transmitido à SEFAZ, e
 * um valor fiscal precisa de teste que não dependa de banco para rodar.
 */
export function resolveManifestCities(
  rows: readonly ManifestCityRow[],
): Map<string, ManifestCities> {
  const cities = new Map<string, ManifestCities>()
  const destinationsByDocument = new Map<string, ManifestCityRow[]>()

  for (const row of rows) {
    if (row.role === ORIGIN_ROLE) {
      const current = cities.get(row.documentId) ?? { discharge: EMPTY_CITY, origin: EMPTY_CITY }
      cities.set(row.documentId, { ...current, origin: toLocation(row) })
      continue
    }
    if (row.role !== 'recipient' && row.role !== 'delivery') continue

    const current = destinationsByDocument.get(row.documentId)
    if (current === undefined) destinationsByDocument.set(row.documentId, [row])
    else current.push(row)
  }

  for (const [documentId, candidates] of destinationsByDocument) {
    const chosen = resolvePhysicalDestination(
      candidates.map((row) => ({
        components: {
          cityCode: row.cityCode,
          number: row.number,
          postalCode: row.postalCode,
        },
        origin: row.role === 'delivery' ? ('delivery' as const) : ('recipient' as const),
        row,
      })),
    )
    if (chosen === null) continue

    const current = cities.get(documentId) ?? { discharge: EMPTY_CITY, origin: EMPTY_CITY }
    cities.set(documentId, { ...current, discharge: toLocation(chosen.row) })
  }

  return cities
}
