/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T2.1: bairro, cidade e coordenada de cada parada da lista do bot. Bairro e cidade vêm do endereço do
 * destinatário da nota (`nfe_participants` papel `recipient` → `nfe_addresses`), em UMA consulta para todas as
 * paradas; a coordenada é a da própria parada. Refinamento: falha na leitura devolve as paradas como vieram.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { formatPlaceName } from '../domain/whatsapp-stop-place.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type StopRow = {
  readonly city?: unknown
  readonly district?: unknown
  readonly stop_id?: unknown
}

type StopPlace = { readonly city?: string; readonly district?: string }

export type PlacedStop = {
  readonly city?: string
  readonly coordinate?: { readonly latitude: number; readonly longitude: number }
  readonly district?: string
}

type StopWithPoint = {
  readonly id: string
  readonly latitude: string | null
  readonly longitude: string | null
}

export async function readStopPlaces(
  database: Database,
  input: { readonly companyId: string; readonly stopIds: readonly string[] },
): Promise<ReadonlyMap<string, StopPlace>> {
  const places = new Map<string, StopPlace>()
  if (input.stopIds.length === 0) return places
  const rows = (await database.execute(sql`
    select document.stop_id as stop_id, address.district as district, address.city as city
      from trip_documents document
      join nfe_participants participant
        on participant.company_id = document.company_id and participant.document_id = document.nfe_document_id
       and participant.role = 'recipient'
      join nfe_addresses address
        on address.company_id = participant.company_id and address.participant_id = participant.id
     where document.company_id = ${input.companyId}::uuid
       and document.stop_id in (${sql.join(
         input.stopIds.map((stopId) => sql`${stopId}::uuid`),
         sql`, `,
       )})
       and document.released_at is null
     order by document.created_at, document.id`)) as unknown as readonly StopRow[]
  for (const row of rows) {
    if (typeof row.stop_id !== 'string' || places.has(row.stop_id)) continue
    const district = formatPlaceName(typeof row.district === 'string' ? row.district : undefined)
    const city = formatPlaceName(typeof row.city === 'string' ? row.city : undefined)
    if (district === undefined && city === undefined) continue
    places.set(row.stop_id, {
      ...(city === undefined ? {} : { city }),
      ...(district === undefined ? {} : { district }),
    })
  }
  return places
}

function coordinateOf(stop: StopWithPoint): PlacedStop['coordinate'] {
  if (stop.latitude === null || stop.longitude === null) return undefined
  const latitude = Number(stop.latitude)
  const longitude = Number(stop.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : undefined
}

/** As paradas com `district`, `city` e `coordinate` preenchidos quando há dado; sem dado, o campo não existe. */
export async function placeStops<Stop extends StopWithPoint>(
  database: Database,
  input: {
    readonly companyId: string
    readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
    readonly stops: readonly Stop[]
  },
): Promise<readonly (Stop & PlacedStop)[]> {
  let places: ReadonlyMap<string, StopPlace> = new Map()
  try {
    places = await readStopPlaces(database, {
      companyId: input.companyId,
      stopIds: input.stops.map((stop) => stop.id),
    })
  } catch (error) {
    input.logger?.warn('whatsapp_stop_place.read_failed', {
      companyId: input.companyId,
      errorName: error instanceof Error ? error.name : typeof error,
    })
  }
  return input.stops.map((stop) => {
    const coordinate = coordinateOf(stop)
    return {
      ...stop,
      ...places.get(stop.id),
      ...(coordinate === undefined ? {} : { coordinate }),
    }
  })
}
