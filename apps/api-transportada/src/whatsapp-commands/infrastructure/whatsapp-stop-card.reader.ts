/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Lê o **bloco da parada** que o bot mostra (`whatsapp-stop-card.policy.ts`) a partir da mesma viagem do motorista
 * que o app lê (`listActiveTrips`), mais a contratante da nota e o último ponto que o motorista compartilhou nesta
 * viagem (o evento com coordenada mais recente). Distância e chegada prevista vêm da estrada (OSRM, o mesmo
 * `RouteGeometryPort` do mapa da viagem) e **só** desse ponto: sem ponto compartilhado, ou sem estrada, a linha some —
 * nunca uma estimativa a partir da parada anterior.
 *
 * ⚠️ Log sem PII: só empresa e motivo, nunca coordenada, endereço nem nome.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { RouteGeometryPort } from '../../trips/application/route-geometry.port.js'
import type {
  DriverTrip,
  DriverTripStop,
} from '../../trips/application/find-current-driver-trip.use-case.js'
import { findNextPendingStop } from '../../trips/domain/driver-stop-resolution.policy.js'
import type { StopCardView } from '../domain/whatsapp-driver-journey.policy.js'
import {
  cityOfStopLabel,
  sumDecimalAmounts,
  type StopCard,
  type StopCardEta,
} from '../domain/whatsapp-stop-card.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CLOSED = new Set(['delivered', 'returned'])

export type WhatsAppStopCardReader = {
  /** `withEta`: pede a estrada do último ponto do motorista (saída e oferta da próxima rota). */
  read(input: {
    readonly companyId: string
    readonly driverId: string
    readonly stopId: string
    readonly withEta?: boolean
  }): Promise<StopCardView | null>
}

export const WHATSAPP_STOP_CARD_LOG = {
  etaUnavailable: 'whatsapp_stop_card.eta_unavailable',
  readFailed: 'whatsapp_stop_card.read_failed',
} as const

/**
 * De qual parada (e de quais eventos dela) o ponto compartilhado vale como origem da estrada — o trecho atual, por parada e não por relógio.
 * Saída (parada a caminho): o ponto da saída desta parada. Oferta da próxima: o ponto da última parada em que o motorista
 * chegou (chegada ou baixa). Sem nenhuma, `null` (sem estrada): um ponto da manhã nunca vira a origem da tarde.
 */
export type EtaOrigin = {
  /** Os eventos da parada que contam: a saída (a caminho) ou o que se registra nela (chegada e baixa). */
  readonly kinds: readonly string[]
  readonly stopId: string
}

const AT_STOP_EVENTS = ['arrived', 'delivered', 'returned'] as const

export function resolveEtaOrigin(
  trip: Pick<DriverTrip, 'stops'>,
  stopId: string,
): EtaOrigin | null {
  const target = trip.stops.find((stop) => stop.id === stopId)
  if (target !== undefined && target.enRouteSince !== null && target.arrivedAt === null) {
    return { kinds: ['departed'], stopId: target.id }
  }
  const arrived = trip.stops
    .filter((stop) => stop.id !== stopId && stop.arrivedAt !== null)
    .map((stop) => ({ id: stop.id, time: new Date(stop.arrivedAt ?? '').getTime() }))
    .filter((stop) => Number.isFinite(stop.time))
    .sort((left, right) => right.time - left.time)
  const [last] = arrived
  return last === undefined ? null : { kinds: AT_STOP_EVENTS, stopId: last.id }
}

/** O evento com coordenada mais recente dos eventos de `origin` — a origem da estrada (294 RF30). */
export async function readLastSharedPoint(
  database: Database,
  companyId: string,
  origin: EtaOrigin,
): Promise<{ readonly latitude: number; readonly longitude: number } | null> {
  const rows = (await database.execute(sql`
    select event.latitude::text as latitude, event.longitude::text as longitude
      from trip_stop_events event
     where event.company_id = ${companyId}::uuid and event.stop_id = ${origin.stopId}::uuid
       and event.kind in (${sql.join(
         origin.kinds.map((kind) => sql`${kind}`),
         sql`, `,
       )})
       and event.latitude is not null and event.longitude is not null
     order by event.created_at desc
     limit 1`)) as unknown as readonly {
    readonly latitude?: unknown
    readonly longitude?: unknown
  }[]
  const latitude = Number(rows[0]?.latitude)
  const longitude = Number(rows[0]?.longitude)
  return rows[0] === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    ? null
    : { latitude, longitude }
}

function shownDocuments(stop: DriverTripStop) {
  const open = stop.documents.filter((document) => !CLOSED.has(document.separationStatus))
  return open.length > 0 ? open : stop.documents
}

function volumesOf(documents: DriverTripStop['documents']): number | null {
  let total = 0
  for (const document of documents) {
    const value = Number(document.volumeCount)
    if (document.volumeCount.trim() === '' || !Number.isFinite(value)) return null
    total += value
  }
  return total > 0 ? Math.round(total) : null
}

function cardOf(trip: DriverTrip, stop: DriverTripStop, contractorName: string): StopCard {
  const documents = shownDocuments(stop)
  const [first] = documents
  return {
    address: stop.label,
    city: cityOfStopLabel(stop.label),
    contractorName,
    coordinate:
      stop.latitude === null || stop.longitude === null
        ? null
        : { latitude: stop.latitude, longitude: stop.longitude },
    documentNumbers: documents.map((document) => document.number),
    isAddressReliable: stop.isAddressReliable,
    recipientName: first?.recipientDisplayName || first?.recipientName || '',
    sequence: stop.sequence,
    stopId: stop.id,
    totalStops: trip.stops.length,
    totalValue: sumDecimalAmounts(documents.map((document) => document.totalAmount)),
    volumes: volumesOf(documents),
  }
}

export function createWhatsAppStopCardReader(dependencies: {
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  /** Ausente (sem `ROUTING_MATRIX_URL`), a linha da estrada nunca aparece. */
  readonly routing?: RouteGeometryPort
}): WhatsAppStopCardReader {
  const { database } = dependencies

  async function contractorNameOf(companyId: string, documentId: string | undefined) {
    if (documentId === undefined) return ''
    const rows = (await database.execute(sql`
      select coalesce(nullif(trim(contractor.display_name), ''), nullif(participant.legal_name, ''),
                      nullif(participant.trade_name, ''), '') as name
        from trip_documents document
        join nfe_participants participant
          on participant.company_id = document.company_id and participant.document_id = document.nfe_document_id
         and participant.role = 'emitter'
        left join contractors contractor
          on contractor.company_id = participant.company_id and contractor.tax_id = participant.tax_id
       where document.company_id = ${companyId}::uuid and document.id = ${documentId}::uuid
       limit 1`)) as unknown as readonly { readonly name?: unknown }[]
    const name = rows[0]?.name
    return typeof name === 'string' ? name.trim() : ''
  }

  async function etaOf(input: {
    readonly card: StopCard
    readonly companyId: string
    readonly trip: DriverTrip
  }): Promise<StopCardEta | undefined> {
    const { card, companyId } = input
    if (dependencies.routing === undefined || card.coordinate === null) return undefined
    const etaOrigin = resolveEtaOrigin(input.trip, card.stopId)
    if (etaOrigin === null) return undefined
    const origin = await readLastSharedPoint(database, companyId, etaOrigin)
    if (origin === null) return undefined
    const road = await dependencies.routing.readRouteGeometry([
      origin,
      { latitude: Number(card.coordinate.latitude), longitude: Number(card.coordinate.longitude) },
    ])
    const leg = road?.legs[0]
    if (leg === undefined) {
      dependencies.logger?.warn(WHATSAPP_STOP_CARD_LOG.etaUnavailable, {
        companyId,
        reason: 'routing_unavailable',
      })
      return undefined
    }
    return { distanceMetres: leg.distanceMetres, durationSeconds: leg.durationSeconds }
  }

  return {
    /** Melhor esforço: falha na leitura vira `null` (a resposta sai com a frase de sempre), log sem PII. */
    async read(input) {
      try {
        return await readView(input)
      } catch (error) {
        dependencies.logger?.warn(WHATSAPP_STOP_CARD_LOG.readFailed, {
          companyId: input.companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return null
      }
    },
  }

  async function readView({
    companyId,
    driverId,
    stopId,
    withEta,
  }: Parameters<WhatsAppStopCardReader['read']>[0]): Promise<StopCardView | null> {
    const trips = await dependencies.listActiveTrips({ companyId, driverId })
    const trip = trips.find((candidate) => candidate.stops.some((stop) => stop.id === stopId))
    const stop = trip?.stops.find((candidate) => candidate.id === stopId)
    if (trip === undefined || stop === undefined) return null
    const card = cardOf(trip, stop, await contractorNameOf(companyId, shownDocuments(stop)[0]?.id))
    const nextStop = findNextPendingStop(trip.stops.filter((candidate) => candidate.id !== stopId))
    const eta = withEta === true ? await etaOf({ card, companyId, trip }) : undefined
    return {
      card,
      ...(eta === undefined ? {} : { eta }),
      ...(nextStop === undefined ? {} : { next: cardOf(trip, nextStop, '') }),
    }
  }
}
