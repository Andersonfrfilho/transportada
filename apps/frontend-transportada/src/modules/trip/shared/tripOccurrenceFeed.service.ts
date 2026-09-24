/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  TableColumnPreferences,
  TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
} from '@/modules/shared/tableColumnPreferences.service'

import type { OccurrenceAttachment } from './trip.types'

/**
 * A listagem de ocorrências do escritório (leitura pura): une o que houve com a nota e o que houve
 * na parada, servida por `GET /trip-occurrences` com cursor keyset. Cópia por valor do vocabulário
 * da API — o bundle não carrega código dela.
 */
export const TRIP_OCCURRENCE_STAGES = ['separation', 'delivery', 'stop'] as const
export type TripOccurrenceFeedStage = (typeof TRIP_OCCURRENCE_STAGES)[number]

/**
 * Spec 164 D3/RF4: a máquina da tratativa. Cópia por valor do vocabulário da API
 * (`occurrence-case-state.policy.ts`) — o bundle não carrega código do servidor.
 */
export const TRIP_OCCURRENCE_CASE_STATUSES = [
  'recorded',
  'under_review',
  'returned_to_warehouse',
  'awaiting_contractor',
  'decided',
  'closed',
  'cancelled',
] as const
export type TripOccurrenceCaseStatus = (typeof TRIP_OCCURRENCE_CASE_STATUSES)[number]

/** `none` é "sem tratativa aberta" — RF11 exige o filtro incluir esta opção. */
export const TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES = [
  'none',
  ...TRIP_OCCURRENCE_CASE_STATUSES,
] as const
export type TripOccurrenceCaseStatusFilterValue =
  (typeof TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES)[number]

export const TRIP_OCCURRENCE_CASE_DECISION_KINDS = [
  'redelivery_authorized',
  'goods_paid',
  'other',
] as const
export type TripOccurrenceCaseDecisionKind = (typeof TRIP_OCCURRENCE_CASE_DECISION_KINDS)[number]

/** RF10: o que a API devolve por ocorrência — `null` quando ela não abriu tratativa. */
export type TripOccurrenceCaseView = Readonly<{
  decision: null | Readonly<{
    decidedAt: null | string
    kind: TripOccurrenceCaseDecisionKind
    note: string
  }>
  redeliveryPolicy: 'allowed' | 'blocked'
  /**
   * A API só devolve `null` hoje (T8) — o total por acerto chega numa spec futura. Achado B6 da
   * revisão: o tipo já aceita o valor (`string`, dinheiro) para o dia em que a API o preencher —
   * um guard que continuasse exigindo `null` literal reprovaria o feed inteiro nesse dia.
   */
  settlementTotal: null | string
  status: TripOccurrenceCaseStatus
  updatedAt: string
}>

/** Spec 164 T23 (RF22): quem pagou o item — só `driver` carrega `payerId`. */
export const OCCURRENCE_SETTLEMENT_PAYER_KINDS = [
  'driver',
  'carrier',
  'contractor',
  'insurer',
] as const
export type OccurrenceSettlementPayerKind = (typeof OCCURRENCE_SETTLEMENT_PAYER_KINDS)[number]

export const OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES = ['nfe', 'manual'] as const
export type OccurrenceSettlementAmountSource = (typeof OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES)[number]

export type OccurrenceSettlementItem = Readonly<{
  amount: string
  amountSource: OccurrenceSettlementAmountSource
  payerId?: string
  payerKind: OccurrenceSettlementPayerKind
  productCode: string
}>

export type OccurrenceSettlementResult = Readonly<{
  items: readonly OccurrenceSettlementItem[]
  total: string
}>

/**
 * `GET /trip-occurrences/:id/case/settlement`: mesmo formato do item que o `PUT` aceita, com
 * `reimbursedAt` a mais — a marca de ressarcido que só a leitura carrega.
 */
export type OccurrenceSettlementItemView = OccurrenceSettlementItem &
  Readonly<{ reimbursedAt: null | string }>

export type OccurrenceSettlementView = Readonly<{
  items: readonly OccurrenceSettlementItemView[]
  total: string
}>

export type TripOccurrenceFeedItem = Readonly<{
  case: null | TripOccurrenceCaseView
  createdAt: string
  description: string
  driverName: string
  hasAttachment: boolean
  id: string
  invoiceNumber: null | string
  invoiceSeries: null | string
  notifies: boolean
  source: 'document' | 'stop'
  stage: 'delivery' | 'separation' | null
  stopLabel: null | string
  tripId: string
  typeName: string
  vehiclePlate: string
}>

/**
 * Spec 183 RF2: de quem é a carga, para onde ia e quanto vale. `totalValue` é string decimal —
 * dinheiro nunca vira `number` na tela. `destination` é o destino físico (onde o caminhão para).
 */
export type TripOccurrenceDocument = Readonly<{
  contractor: Readonly<{ contractorId: null | string; name: string; taxId: null | string }> | null
  destination: Readonly<{
    city: string
    label: string
    origin: 'delivery' | 'recipient'
    postalCode: null | string
    recipientName: string
    state: string
  }> | null
  nfeDocumentId: string
  totalValue: string
}>

/** Spec 183 RF3: o motorista da viagem, para o escritório falar com ele. */
export type TripOccurrenceDetailDriver = Readonly<{
  driverId: string
  email: string
  name: string
  phone: string
  /** Caminho público da foto na API (`/public/company-users/:token/picture`), ou `null`. */
  picturePath: null | string
  /** Só o telefone **verificado** do WhatsApp (ADR-0063). */
  whatsappPhone: null | string
}>

/** Spec 183 RF1: a linha da listagem, com autoria, nota e o motorista. */
export type TripOccurrenceDetail = TripOccurrenceFeedItem &
  Readonly<{
    actorName: null | string
    channel: string
    document: null | TripOccurrenceDocument
    driver: null | TripOccurrenceDetailDriver
    onBehalfOfDriverName: null | string
  }>

export type TripOccurrenceFeedPage = Readonly<{
  items: readonly TripOccurrenceFeedItem[]
  nextCursor: null | string
}>

/** Spec 161 T24: mesmo formato de `OccurrenceAttachment` (RF8) — o feed lê a mesma forma que o
 * painel da nota, sem uma segunda definição para divergir dela. */
export type TripOccurrenceAttachment = OccurrenceAttachment

export type TripOccurrenceFeedOrder = 'asc' | 'desc'

export type TripOccurrenceFeedFilters = Readonly<{
  /** RF11: estado da tratativa, incluindo `none` ("sem tratativa"). Todos selecionados = sem filtro. */
  caseStatuses: readonly TripOccurrenceCaseStatusFilterValue[]
  createdFrom: string
  createdUntil: string
  /** Placas digitadas, separadas por vírgula — multi-valor por campo. */
  platesQuery: string
  stages: readonly TripOccurrenceFeedStage[]
  /** Nomes de tipo (ou kind de parada), separados por vírgula. */
  typesQuery: string
}>

export const EMPTY_TRIP_OCCURRENCE_FILTERS: TripOccurrenceFeedFilters = {
  caseStatuses: TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
  createdFrom: '',
  createdUntil: '',
  platesQuery: '',
  stages: TRIP_OCCURRENCE_STAGES,
  typesQuery: '',
}

export const TRIP_OCCURRENCE_COLUMN_KEYS = [
  'createdAt',
  'stage',
  'typeName',
  'vehiclePlate',
  'driverName',
  'stopLabel',
  'invoice',
  'notified',
] as const

export type TripOccurrenceColumnKey = (typeof TRIP_OCCURRENCE_COLUMN_KEYS)[number]

export type TripOccurrenceColumnPreferences = TableColumnPreferences<TripOccurrenceColumnKey>

export const TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY = 'trip.occurrences.columns.v1'

export const TRIP_OCCURRENCE_PER_PAGE = 25

export function readTripOccurrenceColumnPreferences(
  storage: null | TableColumnStorage,
): TripOccurrenceColumnPreferences {
  return readTableColumnPreferences({
    columns: TRIP_OCCURRENCE_COLUMN_KEYS,
    storage,
    storageKey: TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY,
  })
}

export function writeTripOccurrenceColumnPreferences(
  storage: null | TableColumnStorage,
  preferences: TripOccurrenceColumnPreferences,
): void {
  writeTableColumnPreferences({
    preferences,
    storage,
    storageKey: TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY,
  })
}

export function reorderTripOccurrenceColumns(
  order: readonly TripOccurrenceColumnKey[],
  column: TripOccurrenceColumnKey,
  direction: 'down' | 'up',
): readonly TripOccurrenceColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

/** Cabeçalho de hora alterna asc/desc — ordenação no servidor, nunca no cliente. */
export function toggleTripOccurrenceOrder(order: TripOccurrenceFeedOrder): TripOccurrenceFeedOrder {
  return order === 'desc' ? 'asc' : 'desc'
}

export function toggleTripOccurrenceStage(
  filters: TripOccurrenceFeedFilters,
  stage: TripOccurrenceFeedStage,
): TripOccurrenceFeedFilters {
  const selected = filters.stages.includes(stage)
    ? filters.stages.filter((current) => current !== stage)
    : [...filters.stages, stage]
  return {
    ...filters,
    stages: TRIP_OCCURRENCE_STAGES.filter((current) => selected.includes(current)),
  }
}

export function setTripOccurrenceCaseStatuses(
  filters: TripOccurrenceFeedFilters,
  statuses: readonly TripOccurrenceCaseStatusFilterValue[],
): TripOccurrenceFeedFilters {
  return {
    ...filters,
    caseStatuses: TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.filter((value) =>
      statuses.includes(value),
    ),
  }
}

function parseListQuery(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** Fim do dia inclusivo: o filtro "até 02/09" cobre o dia inteiro, não a meia-noite dele. */
function toDayEnd(day: string): string {
  return `${day}T23:59:59.999Z`
}

function toDayStart(day: string): string {
  return `${day}T00:00:00.000Z`
}

/**
 * Chave vazia não é serializada — a API rejeita com 400 chave fora da allowlist, e filtro no
 * default não restringe nada, então não viaja.
 */
export function serializeTripOccurrenceQuery(
  input: Readonly<{
    cursor: null | string
    filters: TripOccurrenceFeedFilters
    order: TripOccurrenceFeedOrder
    perPage: number
  }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('perPage', String(input.perPage))
  if (input.order !== 'desc') search.set('order', input.order)
  if (input.filters.createdFrom.length > 0) {
    search.set('createdFrom', toDayStart(input.filters.createdFrom))
  }
  if (input.filters.createdUntil.length > 0) {
    search.set('createdUntil', toDayEnd(input.filters.createdUntil))
  }
  const plates = parseListQuery(input.filters.platesQuery)
  if (plates.length > 0) search.set('plateIn', plates.join(','))
  const types = parseListQuery(input.filters.typesQuery)
  if (types.length > 0) search.set('typeIn', types.join(','))
  if (
    input.filters.stages.length > 0 &&
    input.filters.stages.length < TRIP_OCCURRENCE_STAGES.length
  ) {
    search.set('stageIn', input.filters.stages.join(','))
  }
  if (
    input.filters.caseStatuses.length > 0 &&
    input.filters.caseStatuses.length < TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.length
  ) {
    search.set('caseStatusIn', input.filters.caseStatuses.join(','))
  }
  return search.toString()
}

/** Nota sem número (ocorrência de parada sem nota vinculada) imprime ausência, nunca "null/null". */
export function formatOccurrenceInvoice(
  invoiceNumber: null | string,
  invoiceSeries: null | string,
): string {
  if (invoiceNumber === null || invoiceNumber.length === 0) return ''
  if (invoiceSeries === null || invoiceSeries.length === 0) return invoiceNumber
  return `${invoiceNumber}/${invoiceSeries}`
}

/** O rótulo do tipo: cadastrado imprime o nome da empresa; relato de parada traduz o kind. */
export function resolveOccurrenceTypeLabel(
  item: Pick<TripOccurrenceFeedItem, 'source' | 'typeName'>,
): Readonly<{ labelKey: null | string; value: string }> {
  if (item.source === 'stop') {
    return { labelKey: `occurrenceFeed.kind.${item.typeName}`, value: item.typeName }
  }
  return { labelKey: null, value: item.typeName }
}

export function countActiveTripOccurrenceFilters(filters: TripOccurrenceFeedFilters): number {
  const scalarFields = [
    filters.createdFrom,
    filters.createdUntil,
    filters.platesQuery,
    filters.typesQuery,
  ]
  const stagesChanged = filters.stages.length === TRIP_OCCURRENCE_STAGES.length ? 0 : 1
  const caseStatusesChanged =
    filters.caseStatuses.length === TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.length ? 0 : 1
  return (
    scalarFields.filter((field) => field.trim().length > 0).length +
    stagesChanged +
    caseStatusesChanged
  )
}
