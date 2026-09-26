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

/**
 * Spec 158 D5. `TRIP_STOP_EVENT_KINDS.occurrence` nunca aparece aqui — não é escrito hoje.
 *
 * Spec 171: `trip.created` é o nono. Mesma fonte de `trip.status_changed` (`trip_status_events`,
 * `listCreatedRows`) — a leitura separa pelas duas linhas que `fromStatus = toStatus` nunca produz
 * numa transição real (`recordTripStatusChange` é no-op nesse caso; só `recordTripCreation` grava).
 */
export const TRIP_TIMELINE_KINDS = [
  'trip.dispatched',
  'trip.status_changed',
  'stop.arrived',
  /**
   * Spec 206 D12: a saída para a parada e o cancelamento dela. Entram no vocabulário **antes** de
   * `listStopEventRows` os mapear (Fase 2), porque o painel é cópia por valor desta lista e publica
   * primeiro (ADR-0081 §9) — a paridade é guardada por
   * `apps/frontend-transportada/test/trip/timeline.contract.ts`.
   */
  'stop.departed',
  'stop.departure_cancelled',
  'document.delivered',
  'document.returned',
  'stop.occurrence',
  'document.occurrence',
  'document.status_changed',
  'trip.created',
] as const
export type TripTimelineKind = (typeof TRIP_TIMELINE_KINDS)[number]

/**
 * Spec 158 D8: desempate de `occurredAt` igual — quanto **maior** a prioridade, mais acima o item
 * aparece. Tudo é decrescente, como a tupla `(occurred_at, prioridade, id) < cursor` do SQL exige.
 * A troca de status usa o mesmo `now` da chegada ou da entrega que a provocou; lida de cima para
 * baixo, a lista mostra o efeito acima da causa, como em qualquer instante mais recente.
 *
 * Spec 171 RF2: `trip.created` leva a prioridade **menor que qualquer outra** — nascer é sempre o
 * mais antigo de um empate, nunca o efeito de nada.
 */
export const TRIP_TIMELINE_KIND_PRIORITY: Readonly<Record<TripTimelineKind, number>> = {
  'trip.created': -1,
  'stop.arrived': 0,
  /**
   * Spec 206 D12: **0**, o mesmo de `stop.arrived`. O cursor compara a prioridade como `::int`
   * (`trip-timeline-condition.helper.ts:43`), então não cabe fração, e renumerar a tabela quebraria
   * cursor em voo. Com 0 a saída fica abaixo da troca de status que ela provoca (7) — efeito acima da
   * causa (158 D8). O empate com `stop.arrived` só ocorreria no mesmo microssegundo, e a trava das
   * paradas serializa os dois; se ocorresse, o `id` desempata.
   */
  'stop.departed': 0,
  'stop.departure_cancelled': 0,
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

/**
 * Spec 161 T11 (RF12/CA7): a contagem de fotos, **nunca** URL assinada — nem de original, nem de
 * miniatura. Quem quer ver a foto abre a ocorrência (painel ou feed), que é onde RF8/RF9/RF10 já
 * assinam.
 */
export type TripTimelineOccurrenceReference = {
  readonly attachmentCount: number
  readonly note: string
  readonly typeName: string
}

export type TripTimelineItem = {
  readonly actorName: string | null
  /** `null` = canal não registrado (D3/D6) — nunca um valor inventado. */
  readonly channel: TripFieldChannel | null
  /**
   * Spec 158 T12 (spec 156 T8c): `trips.close_reason`, só em `trip.status_changed` para
   * `completed`. O `completed` derivado (`deriveTripStatus`, quando a última nota fecha) nunca tem
   * motivo: `close_reason` só é escrito por `POST /trips/:id/close`.
   */
  readonly closeReason: string | null
  readonly document: TripTimelineDocumentReference | null
  /** Só em `*.status_changed`; os dois vocabulários (viagem, nota) cabem na mesma string. */
  readonly fromStatus: string | null
  readonly id: string
  readonly kind: TripTimelineKind
  /**
   * Spec 205 RF6: a baixa veio pelo "Registrar entrega depois" da app do motorista — só pode ser
   * `true` em `document.delivered`/`document.returned`. Dado, não rótulo: a tela não o interpreta.
   */
  readonly lateRegistration: boolean
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
 * Cursor tipado, nunca serializado cru: `parseTripTimelineCursor`/`encodeTripTimelineCursor`
 * (`trip-timeline-cursor.service.ts`) fazem base64url de JSON. A validação Zod do valor que chega
 * pela querystring é da T6 (rota) — aqui o parse já assume um cursor bem formado, porque quem o
 * produziu foi esta mesma leitura, na página anterior.
 *
 * `occurredAt` é **texto com microssegundos** (`YYYY-MM-DDTHH:mm:ss.SSSSSSZ`, UTC), nunca `Date` —
 * `Date` só guarda milissegundos, e `occurred_at` é `timestamptz` com microssegundos. Um cursor em
 * `Date` arredonda o instante para baixo e a comparação `(occurred_at, prioridade, id) < cursor`
 * passa a excluir, na página seguinte, linhas com o mesmo instante do cursor mas microssegundos
 * maiores — o caso de vários eventos gravados no mesmo `now()` de uma transação (T9).
 */
export type TripTimelineCursor = {
  readonly id: string
  readonly kindPriority: number
  readonly occurredAt: string
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
