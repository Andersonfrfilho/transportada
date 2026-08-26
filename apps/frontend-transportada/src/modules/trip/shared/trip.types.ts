/* Copyright (c) 2026 Ada Technology. MIT License. */
/** ADR-0043 §1: `open`/`closed` migraram para os nove estados da viagem (`open → draft`,
 * `closed → completed`). */
export const TRIP_STATUS = [
  'cancelled',
  'completed',
  'dispatched',
  'draft',
  'in_transit',
  'loading',
  'route_planned',
  'separating',
] as const
export type TripStatus = (typeof TRIP_STATUS)[number]

/** ADR-0043 §1: estado da nota dentro da viagem — coluna `separation_status`. */
export const TRIP_DOCUMENT_SEPARATION_STATUS = [
  'delivered',
  'loaded',
  'pending',
  'returned',
  'separated',
] as const
export type TripDocumentSeparationStatus = (typeof TRIP_DOCUMENT_SEPARATION_STATUS)[number]

export type TripDriverLine = Readonly<{
  driverId: string
  driverName: string
  driverTaxId: string
  position: number
}>

export type Trip = Readonly<{
  companyId: string
  createdAt: string
  id: string
  status: TripStatus
  updatedAt: string
  vehicleId: string
}>

export type TripDocument = Readonly<{
  createdAt: string
  deliveredAt: null | string
  freightCalculationId: null | string
  id: string
  loadedAt: null | string
  nfeDocumentId: null | string
  releasedAt: null | string
  returnedAt: null | string
  returnReason: null | string
  separatedAt: null | string
  separationStatus: TripDocumentSeparationStatus
  stopId: null | string
  tripId: string
  updatedAt: string
}>

export type TripDocumentDetail = TripDocument &
  Readonly<{ cteAuthorized: boolean; fiscalStatus: string }>

/** ADR-0043 §3, T014: as mesmas notas de `TripDetail.documents`, aninhadas sob a parada que as
 * agrupa — nunca uma cópia divergente. Nota sem parada não aparece em nenhum `TripStopDetail`. */
export type TripStopDetail = Readonly<{
  addressKey: string
  arrivedAt: null | string
  completedAt: null | string
  deliveryWindowEnd: null | string
  deliveryWindowStart: null | string
  documents: readonly TripDocumentDetail[]
  id: string
  label: string
  sequence: number
}>

export type TripDetail = Trip &
  Readonly<{
    documents: readonly TripDocumentDetail[]
    drivers: readonly TripDriverLine[]
    stops: readonly TripStopDetail[]
  }>

/**
 * ⚠️ Cópia por valor de `read-trip-fiscal-readiness.use-case.ts` — o bundle não carrega código da
 * API. Spec 059 D1: a prontidão responde **por nota**, com o motivo, porque "não está pronta" é a
 * resposta que manda o operador abrir outra tela.
 */
export const TRIP_DOCUMENT_READINESS_REASONS = [
  'ok',
  'no_cte',
  'cte_in_progress',
  'cte_rejected',
  'cte_cancelled',
] as const
export type TripDocumentReadinessReason = (typeof TRIP_DOCUMENT_READINESS_REASONS)[number]

export const TRIP_FISCAL_READINESS_STATES = [
  'incomplete',
  'ready',
  'manifested',
  'divergent',
] as const
export type TripFiscalReadinessState = (typeof TRIP_FISCAL_READINESS_STATES)[number]

export type TripDocumentReadiness = Readonly<{
  cteAccessKey: null | string
  cteFiscalDocumentId: null | string
  reason: TripDocumentReadinessReason
  rejectionCode: null | string
  rejectionMessage: null | string
  tripDocumentId: string
}>

export type TripFiscalReadiness = Readonly<{
  documents: readonly TripDocumentReadiness[]
  readyCount: number
  state: TripFiscalReadinessState
  totalCount: number
}>

export type StopAddressComponents = Readonly<{
  cityCode: null | string
  number: null | string
  postalCode: null | string
}>

/** ADR-0043 §3 (D9): `requestedBy` (quem pediu) e `actorUserId` (quem executou) são identidades
 * distintas de propósito — a primeira quase nunca é usuária do sistema. */
export type DeliveryAddressOverride = Readonly<{
  actorUserId: string
  createdAt: string
  id: string
  newAddress: StopAddressComponents
  newLabel: string
  previousAddress: StopAddressComponents
  previousLabel: string
  reason: string
  requestedBy: string
  tripDocumentId: string
}>

export type OverrideDeliveryAddressInput = Readonly<{
  documentId: string
  newAddress: StopAddressComponents
  newLabel: string
  reason: string
  requestedBy: string
  tripId: string
}>

export type DeliveryAddressHistoryInput = Readonly<{ documentId: string; tripId: string }>

/** Sem `sortBy`/`sortDirection`: nenhuma rota real do backend implementa ordenação por servidor
 * (ver comentário de `TripFilters` em `trip.port.ts`) — ADR-0024 documenta a consequência no
 * frontend. */
export type TripFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  driverIdEq?: string
  statusEq?: TripStatus
  vehicleIdEq?: string
}>

export type TripPage = Readonly<{
  items: readonly Trip[]
  nextCursor: null | string
}>

export type TripListInput = Readonly<{
  cursor: null | string
  filters?: TripFilters
  limit: number
}>

export type CreateTripBody = Readonly<{
  driverIds: readonly string[]
  vehicleId: string
}>

export type LinkTripDocumentBody = Readonly<{
  freightCalculationId: null | string
  nfeDocumentId: null | string
}>

export type LinkTripDocumentInput = LinkTripDocumentBody & Readonly<{ tripId: string }>

export type TripDocumentActionInput = Readonly<{ documentId: string; tripId: string }>

export type ReorderTripStopsResult = Readonly<{ tripStatus: TripStatus }>

export type ReorderTripStopsInput = Readonly<{ stopIds: readonly string[]; tripId: string }>

/** As três transições que o escritório aciona por nota ou em lote — `deliver` é ação de rua
 * (spec 057) e só existe hoje pelo lote antigo, sem rota própria de item único (T012). */
export const TRIP_DOCUMENT_TRANSITION_ACTIONS = ['load', 'return', 'separate'] as const
export type TripDocumentTransitionAction = (typeof TRIP_DOCUMENT_TRANSITION_ACTIONS)[number]

export const TRIP_BATCH_ACTIONS = ['deliver', 'load', 'return', 'separate'] as const
export type TripBatchAction = (typeof TRIP_BATCH_ACTIONS)[number]

export type TransitionTripDocumentInput = Readonly<{
  action: TripDocumentTransitionAction
  documentId: string
  note?: null | string
  returnReason?: null | string
  tripId: string
}>

export type TransitionTripDocumentResult = Readonly<{
  document: TripDocument
  tripStatus: TripStatus
}>

export const TRIP_BATCH_ITEM_OUTCOME = [
  'applied',
  'blocked',
  'not_found',
  'raced',
  'unchanged',
] as const
export type TripBatchItemOutcome = (typeof TRIP_BATCH_ITEM_OUTCOME)[number]

export type TripDocumentBatchItemResult = Readonly<{
  documentId: string
  outcome: TripBatchItemOutcome
  reason?: string
}>

export type BatchStatusInput = Readonly<{
  action: TripBatchAction
  documentIds: readonly string[]
  note?: null | string
  returnReason?: null | string
  tripId: string
}>

export type BatchStatusResult = Readonly<{
  items: readonly TripDocumentBatchItemResult[]
  tripStatus: TripStatus
}>

export type DispatchTripInput = Readonly<{
  force?: boolean
  forceReason?: null | string
  tripId: string
}>

export type DispatchTripResult = Readonly<{ tripStatus: TripStatus }>

export type CancelTripResult = Readonly<{ tripStatus: TripStatus }>

export type PlanTripRouteResult = Readonly<{ tripStatus: TripStatus }>

export const SCANNED_NFE_STATUS = ['authorized', 'cancelled', 'denied', 'unsigned'] as const
export type ScannedNfeStatus = (typeof SCANNED_NFE_STATUS)[number]

/**
 * O recorte que o separador lê da nota bipada. A linha servida por `/nfe-documents` pertence a
 * outro módulo e tem vinte e dois campos — guardar só estes é o que impede a tela da viagem de
 * quebrar quando a listagem de notas ganhar coluna.
 */
export type ScannedNfeDocument = Readonly<{
  accessKey: string
  emitterName: string
  id: string
  issuedAt: string
  number: string
  recipientName: string
  series: string
  status: ScannedNfeStatus
  totalAmount: string
}>

export type FindNfeDocumentByAccessKeyInput = Readonly<{
  accessKey: string
  signal?: AbortSignal
}>
