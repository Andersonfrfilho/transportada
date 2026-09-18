/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 D5/D6: o formato do item da linha do tempo e os tipos de leitura. Oito fontes viram uma
 * lista só, no mesmo molde de `trip-occurrence-feed.use-case.ts` — a diferença é que aqui a página é
 * decidida por três chaves (`occurredAt`, prioridade do `kind`, `id`), não duas, porque duas fontes
 * podem compartilhar o mesmo `occurredAt` (D8: a chegada e a troca de status que ela causa usam o
 * mesmo `now` do caso de uso).
 */
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'

/** Spec 158 D5. `TRIP_STOP_EVENT_KINDS.occurrence` nunca aparece aqui — não é escrito hoje. */
export const TRIP_TIMELINE_KINDS = [
  'trip.dispatched',
  'trip.status_changed',
  'stop.arrived',
  'document.delivered',
  'document.returned',
  'stop.occurrence',
  'document.occurrence',
  'document.status_changed',
] as const
export type TripTimelineKind = (typeof TRIP_TIMELINE_KINDS)[number]

/**
 * Spec 158 D8: desempate de `occurredAt` igual — quanto **maior** a prioridade, mais acima o item
 * aparece. Tudo é decrescente, como a tupla `(occurred_at, prioridade, id) < cursor` do SQL exige.
 * A troca de status usa o mesmo `now` da chegada ou da entrega que a provocou; lida de cima para
 * baixo, a lista mostra o efeito acima da causa, como em qualquer instante mais recente.
 */
export const TRIP_TIMELINE_KIND_PRIORITY: Readonly<Record<TripTimelineKind, number>> = {
  'stop.arrived': 0,
  'stop.occurrence': 1,
  'document.occurrence': 2,
  'document.returned': 3,
  'document.delivered': 4,
  'document.status_changed': 5,
  'trip.dispatched': 6,
  'trip.status_changed': 7,
}

export type TripTimelineStopReference = {
  readonly id: string
  readonly sequence: number
}

/**
 * `number`/`series` seguem `TripOccurrenceFeedItem.invoiceNumber/invoiceSeries` (anuláveis): o
 * vínculo pode ser de um `freightCalculationId` sem NF-e importada ainda.
 */
export type TripTimelineDocumentReference = {
  readonly id: string
  readonly number: string | null
  readonly series: string | null
}

export type TripTimelineOccurrenceReference = {
  readonly note: string
  readonly typeName: string
}

export type TripTimelineItem = {
  readonly actorName: string | null
  /** `null` = canal não registrado (D3/D6) — nunca um valor inventado. */
  readonly channel: TripFieldChannel | null
  readonly document: TripTimelineDocumentReference | null
  /** Só em `*.status_changed`; os dois vocabulários (viagem, nota) cabem na mesma string. */
  readonly fromStatus: string | null
  readonly id: string
  readonly kind: TripTimelineKind
  readonly occurrence: TripTimelineOccurrenceReference | null
  readonly occurredAt: string
  readonly onBehalfOfDriverName: string | null
  /** D6: só quando `channel = 'office'` e a diferença para `occurredAt` passa de 60 s. */
  readonly recordedAt: string | null
  /** Só em `document.returned`. */
  readonly returnReason: string | null
  readonly stop: TripTimelineStopReference | null
  readonly toStatus: string | null
}

/**
 * Cursor tipado, nunca serializado cru: `parseTripTimelineCursor`/`encodeTripTimelineCursor` (na
 * infraestrutura, junto de `mergeTripTimeline`) fazem base64url de JSON. A validação Zod do valor
 * que chega pela querystring é da T6 (rota) — aqui o parse já assume um cursor bem formado, porque
 * quem o produziu foi esta mesma leitura, na página anterior.
 */
export type TripTimelineCursor = {
  readonly id: string
  readonly kindPriority: number
  readonly occurredAt: Date
}

export type ReadTripTimelineParams = {
  readonly companyId: string
  readonly cursor: TripTimelineCursor | null
  readonly limit: number
  readonly tripId: string
}

export type ReadTripTimelineResult = {
  readonly items: readonly TripTimelineItem[]
  readonly nextCursor: string | null
}
