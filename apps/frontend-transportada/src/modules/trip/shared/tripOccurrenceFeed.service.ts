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

/**
 * A listagem de ocorrências do escritório (leitura pura): une o que houve com a nota e o que houve
 * na parada, servida por `GET /trip-occurrences` com cursor keyset. Cópia por valor do vocabulário
 * da API — o bundle não carrega código dela.
 */
export const TRIP_OCCURRENCE_STAGES = ['separation', 'delivery', 'stop'] as const
export type TripOccurrenceFeedStage = (typeof TRIP_OCCURRENCE_STAGES)[number]

export type TripOccurrenceFeedItem = Readonly<{
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

export type TripOccurrenceFeedPage = Readonly<{
  items: readonly TripOccurrenceFeedItem[]
  nextCursor: null | string
}>

export type TripOccurrenceAttachment = Readonly<{
  downloadUrl: string
  expiresAt: string
  id: string
  mimeType: string
}>

export type TripOccurrenceFeedOrder = 'asc' | 'desc'

export type TripOccurrenceFeedFilters = Readonly<{
  createdFrom: string
  createdUntil: string
  /** Placas digitadas, separadas por vírgula — multi-valor por campo. */
  platesQuery: string
  stages: readonly TripOccurrenceFeedStage[]
  /** Nomes de tipo (ou kind de parada), separados por vírgula. */
  typesQuery: string
}>

export const EMPTY_TRIP_OCCURRENCE_FILTERS: TripOccurrenceFeedFilters = {
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
  return scalarFields.filter((field) => field.trim().length > 0).length + stagesChanged
}
