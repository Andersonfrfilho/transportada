/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A descoberta escolhe o destino físico da nota com a **mesma** função do roteirizador
 * (`resolvePhysicalDestination`, spec 073) — nunca um `COALESCE` em SQL, que seria uma segunda regra de
 * "endereço utilizável". O código de cidade que sai dela é filtrado aqui, em TypeScript, antes do
 * upsert: a CHECK `holiday_import_cities_city_check` recusaria o lote inteiro por um só código lixo.
 */
import {
  resolvePhysicalDestination,
  type PhysicalDestinationOrigin,
} from '../../routing/domain/physical-destination.policy.js'

import { BRAZILIAN_STATE_IBGE_CODE_LIST } from './brazilian-state.constant.js'
import { CITY_IBGE_CODE_PATTERN } from './holiday-provider.constant.js'

const STATE_CODE_LENGTH = 2

export type DestinationRow = {
  readonly cityCode: string | null
  readonly documentId: string
  readonly number: string | null
  readonly origin: PhysicalDestinationOrigin
  readonly postalCode: string | null
}

export type DestinationSummary = {
  readonly cityCounts: ReadonlyMap<string, number>
  readonly discardedCityCodes: number
  readonly documentsWithoutDestination: number
}

/** Município IBGE de sete dígitos e de UF que existe; qualquer outra coisa é `undefined`. */
export function readDiscoveredCityCode(cityCode: string | null | undefined): string | undefined {
  const trimmed = cityCode?.trim()
  if (trimmed === undefined || !CITY_IBGE_CODE_PATTERN.test(trimmed)) return undefined

  const stateCode = trimmed.slice(0, STATE_CODE_LENGTH)
  const isKnownState = (BRAZILIAN_STATE_IBGE_CODE_LIST as readonly string[]).includes(stateCode)
  return isKnownState ? trimmed : undefined
}

function groupByDocument(rows: readonly DestinationRow[]): Map<string, DestinationRow[]> {
  const byDocument = new Map<string, DestinationRow[]>()
  for (const row of rows) {
    const current = byDocument.get(row.documentId)
    if (current === undefined) byDocument.set(row.documentId, [row])
    else current.push(row)
  }
  return byDocument
}

/** Uma nota conta uma vez, na cidade do destino físico dela. */
export function summarizeDocumentDestinations(input: {
  readonly documentIds: readonly string[]
  readonly rows: readonly DestinationRow[]
}): DestinationSummary {
  const byDocument = groupByDocument(input.rows)
  const cityCounts = new Map<string, number>()
  let discardedCityCodes = 0
  let documentsWithoutDestination = 0

  for (const documentId of input.documentIds) {
    const chosen = resolvePhysicalDestination(
      (byDocument.get(documentId) ?? []).map((row) => ({
        cityCode: row.cityCode,
        components: { cityCode: row.cityCode, number: row.number, postalCode: row.postalCode },
        origin: row.origin,
      })),
    )
    if (chosen === null) {
      documentsWithoutDestination += 1
      continue
    }

    const cityCode = readDiscoveredCityCode(chosen.cityCode)
    if (cityCode === undefined) {
      discardedCityCodes += 1
      continue
    }
    cityCounts.set(cityCode, (cityCounts.get(cityCode) ?? 0) + 1)
  }

  return { cityCounts, discardedCityCodes, documentsWithoutDestination }
}
