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
  /** Spec 065 D4c: `null` é "derive da classificação das notas", não "não precisa". */
  requiresMdfe: boolean | null
  requiresMdfeReason: null | string
  status: TripStatus
  updatedAt: string
  vehicleId: string
}>

/**
 * Spec 073 RF4/CA10: de onde saiu o endereço para o qual o motorista foi. `delivery` é o
 * `<entrega>` da nota; `recipient`, o cadastro do destinatário. Nulo é vínculo anterior à spec,
 * ou nota que não resolve a destino algum — a tela cala, em vez de afirmar a origem errada.
 */
export const TRIP_DESTINATION_ORIGINS = ['delivery', 'recipient'] as const

export type TripDestinationOrigin = (typeof TRIP_DESTINATION_ORIGINS)[number]

export type TripDocument = Readonly<{
  createdAt: string
  deliveredAt: null | string
  destinationOrigin: null | TripDestinationOrigin
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
  Readonly<{
    cteAuthorized: boolean
    fiscalStatus: string
    /** Spec 079 T017: como a nota se chama na tela. `null` no vínculo que é só cálculo de frete. */
    nfeIssuedAt?: null | string
    nfeNumber?: null | string
    nfeSeries?: null | string
    nfeTotalValue?: null | string
  }>

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

/**
 * Spec 075: quanto do baú já foi ocupado. ⚠️ `source: 'estimated'` obriga a tela a imprimir a marca
 * de estimativa junto do número — há contrato guardando isso.
 */
/**
 * Spec 079: o peso da carga da viagem, com a origem. Uma nota estimada torna o total estimado, e a
 * tela é obrigada a imprimir a marca junto do número — há contrato guardando isso.
 */
export type TripCargoWeight = Readonly<{
  documentsWithoutWeight: number
  grossWeightKilograms: string
  source: 'declared' | 'estimated'
}>

export type TripOccupancy = Readonly<{
  /** As medidas de onde o m³ saiu; `null` no degrau em que alguém digitou o volume. */
  capacityDimensions: Readonly<{ heightM: string; lengthM: string; widthM: string }> | null
  capacityM3: string
  capacitySource: 'measured' | 'declared' | 'reference'
  documentsWithoutVolume: number
  loadedM3: string
  occupancyRatio: string
  source: 'declared' | 'estimated'
}>

/**
 * Spec 076: a fatia do baú de cada parada. ⚠️ Representação proporcional, **não plano de estiva** —
 * a NF-e não traz dimensão de volume, e não há como dizer onde cada caixa vai.
 */
export type TripCargoLayout = Readonly<{
  overflowM3: string
  slices: readonly Readonly<{
    label: string
    /** `1` é o fundo, e o fundo é da última entrega. */
    loadOrder: number
    sequence: number
    share: string
    volumeM3: string
  }>[]
  stopsWithoutVolume: readonly Readonly<{ documentCount: number; label: string }>[]
}>

export type TripDetail = Trip &
  Readonly<{
    documents: readonly TripDocumentDetail[]
    drivers: readonly TripDriverLine[]
    cargoLayout: TripCargoLayout | null
    cargoWeight: TripCargoWeight | null
    occupancy: TripOccupancy | null
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
  /** Entrega no município da transportadora: vira NFS-e, e **não** bloqueia o manifesto (065 D4). */
  'nfse_expected',
  /** Sem município de destino não se decide o documento — pendência explícita, nunca um chute. */
  'city_unknown',
] as const
export type TripDocumentReadinessReason = (typeof TRIP_DOCUMENT_READINESS_REASONS)[number]

export const TRIP_FISCAL_READINESS_STATES = [
  'incomplete',
  'ready',
  'manifested',
  'divergent',
  /** Viagem só de entrega urbana: não tem manifesto a emitir, e isso não é "incompleta". */
  'not_applicable',
] as const
export type TripFiscalReadinessState = (typeof TRIP_FISCAL_READINESS_STATES)[number]

export type TripDocumentReadiness = Readonly<{
  cteAccessKey: null | string
  cteFiscalDocumentId: null | string
  expectedDocument: 'cte' | 'nfse' | null
  nfeDocumentId: null | string
  reason: TripDocumentReadinessReason
  rejectionCode: null | string
  rejectionMessage: null | string
  tripDocumentId: string
}>

export type TripFiscalReadiness = Readonly<{
  documents: readonly TripDocumentReadiness[]
  manifestableCount: number
  nfseCount: number
  readyCount: number
  state: TripFiscalReadinessState
  totalCount: number
}>

/** Spec 065 D4c: o que a viagem passou a exigir, já com a derivação aplicada pelo servidor. */
export type TripMdfeRequirement = Readonly<{
  effectiveRequiresMdfe: boolean
  manifestableCount: number
  reason: null | string
  requiresMdfe: boolean | null
}>

export type SetTripMdfeRequirementInput = Readonly<{
  reason: null | string
  requiresMdfe: boolean | null
  tripId: string
}>

/** Spec 065 D4bis: o lote urgente da viagem — quantas notas foram, e qual lote nasceu. */
export type TripCteBatchResult = Readonly<{
  batchId: string
  documentCount: number
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
