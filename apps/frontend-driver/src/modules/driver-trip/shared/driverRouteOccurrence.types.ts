/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 266: o motorista lê as ocorrências da rota; "resolvida" e "cancelada" são do servidor, "na fila" e "recusada" são da fila local. */
export const ROUTE_OCCURRENCE_KINDS = ['document', 'stop'] as const
export type RouteOccurrenceKind = (typeof ROUTE_OCCURRENCE_KINDS)[number]

export const ROUTE_OCCURRENCE_SERVER_STATES = ['open', 'resolved', 'cancelled'] as const
export type RouteOccurrenceServerState = (typeof ROUTE_OCCURRENCE_SERVER_STATES)[number]

export type RouteOccurrenceResolutionActorKind = 'internal' | 'system'

export type RouteOccurrenceResolution = Readonly<{
  actorKind: RouteOccurrenceResolutionActorKind
  at: string
  /** `internal`: a observação do operador; `system`: a frase fixa do status da tratativa. */
  note: string
}>

export type DriverRouteOccurrence = Readonly<{
  conversationExists: boolean
  documentCount: number
  documentId: string | null
  documentNumber: string | null
  id: string
  kind: RouteOccurrenceKind
  recordedAt: string
  recordedByMe: boolean
  reopenedAt: string | null
  resolution: RouteOccurrenceResolution | null
  state: RouteOccurrenceServerState
  stopId: string
  stopSequence: number
  type: Readonly<{ iconName: string | null; id: string; name: string }>
}>

/** Só metadado: o link assinado vive 5 min e é pedido sob demanda, nunca guardado. */
export type RouteOccurrenceFile = Readonly<{
  contentType: string | null
  name: string | null
  objectId: string
  sizeBytes: number | null
}>

export type RouteOccurrenceAttachment = RouteOccurrenceFile & Readonly<{ messageId: string | null }>

export type RouteOccurrenceTimelineEvent = Readonly<{
  at: string
  kind: 'recorded' | 'photo' | 'cancelled' | 'resolution.resolved' | 'resolution.reopened'
}>

export type DriverRouteOccurrenceDetail = DriverRouteOccurrence &
  Readonly<{
    attachments: readonly RouteOccurrenceAttachment[]
    note: string | null
    photos: readonly RouteOccurrenceFile[]
    signature: RouteOccurrenceFile | null
    timeline: readonly RouteOccurrenceTimelineEvent[]
  }>

/** Decisão C: com a viagem finalizada a API responde 404 e a tela diz "Viagem encerrada". */
export type RouteOccurrencesReadResult<TData> =
  | Readonly<{ data: TData; status: 'loaded' }>
  | Readonly<{ status: 'tripFinished' }>

/** O retrato offline da lista: só metadado, por viagem. */
export type StoredRouteOccurrences = Readonly<{
  occurrences: readonly DriverRouteOccurrence[]
  savedAt: string
  tripId: string
}>

export type RouteOccurrenceSnapshotStore = Readonly<{
  clear: () => Promise<void>
  read: (tripId: string) => Promise<StoredRouteOccurrences | undefined>
  remove: (tripId: string) => Promise<void>
  /** Apaga o retrato de qualquer outra viagem, na mesma transação. */
  retainOnly: (tripId: string) => Promise<void>
  write: (record: StoredRouteOccurrences) => Promise<void>
}>

/** O que a query entrega: dado fresco, retrato offline (com a hora dele) ou viagem encerrada. */
export type RouteOccurrencesQueryData =
  | Readonly<{
      isFromSnapshot: boolean
      occurrences: readonly DriverRouteOccurrence[]
      savedAt: string | undefined
      status: 'loaded'
    }>
  | Readonly<{ status: 'tripFinished' }>
