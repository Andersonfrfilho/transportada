import { NFSE_INVOICE_STATUSES, type NfseInvoiceStatus } from './nfseInvoice.types'
import {
  EMPTY_NFSE_INVOICE_FILTERS,
  NFSE_INVOICE_COLUMN_KEYS,
  type NfseInvoiceColumnKey,
  type NfseInvoiceSortState,
  type NfseInvoiceTableFilters,
} from './nfseInvoiceTable.service'

const SEARCH_PARAM = {
  createdFrom: 'createdFrom',
  createdUntil: 'createdUntil',
  cursor: 'cursor',
  sort: 'sort',
  statuses: 'statuses',
  takerTaxId: 'takerTaxId',
} as const

const STATUS_SEPARATOR = ','
const SORT_SEPARATOR = ':'
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type NfseInvoiceTableSearchState = Readonly<{
  cursor: null | string
  filters: NfseInvoiceTableFilters
  sort: NfseInvoiceSortState
}>

/**
 * A tabela pagina por cursor, então o que a URL guarda é o cursor da página aberta: um número de
 * página não seria recuperável sem repercorrer a lista desde o começo.
 */
export function serializeNfseInvoiceTableSearch(state: NfseInvoiceTableSearchState): string {
  const search = new URLSearchParams()
  if (state.filters.takerTaxId.length > 0) {
    search.set(SEARCH_PARAM.takerTaxId, state.filters.takerTaxId)
  }
  if (state.filters.statuses.length > 0) {
    search.set(SEARCH_PARAM.statuses, state.filters.statuses.join(STATUS_SEPARATOR))
  }
  if (state.filters.createdFrom.length > 0) {
    search.set(SEARCH_PARAM.createdFrom, state.filters.createdFrom)
  }
  if (state.filters.createdUntil.length > 0) {
    search.set(SEARCH_PARAM.createdUntil, state.filters.createdUntil)
  }
  if (state.sort !== null) {
    search.set(SEARCH_PARAM.sort, `${state.sort.column}${SORT_SEPARATOR}${state.sort.direction}`)
  }
  if (state.cursor !== null) search.set(SEARCH_PARAM.cursor, state.cursor)

  return search.toString()
}

export function parseNfseInvoiceTableSearch(search: string): NfseInvoiceTableSearchState {
  const params = new URLSearchParams(search)
  const cursor = params.get(SEARCH_PARAM.cursor)

  return {
    cursor: cursor === null || cursor.length === 0 ? null : cursor,
    filters: {
      createdFrom: readDay(params.get(SEARCH_PARAM.createdFrom)),
      createdUntil: readDay(params.get(SEARCH_PARAM.createdUntil)),
      statuses: readStatuses(params.get(SEARCH_PARAM.statuses)),
      takerTaxId: params.get(SEARCH_PARAM.takerTaxId) ?? EMPTY_NFSE_INVOICE_FILTERS.takerTaxId,
    },
    sort: readSort(params.get(SEARCH_PARAM.sort)),
  }
}

function readDay(value: null | string): string {
  return value !== null && DAY_PATTERN.test(value) ? value : ''
}

function readStatuses(value: null | string): readonly NfseInvoiceStatus[] {
  if (value === null || value.length === 0) return EMPTY_NFSE_INVOICE_FILTERS.statuses
  const known = value
    .split(STATUS_SEPARATOR)
    .filter((candidate): candidate is NfseInvoiceStatus =>
      NFSE_INVOICE_STATUSES.some((status) => status === candidate),
    )
  return known.length === 0 ? EMPTY_NFSE_INVOICE_FILTERS.statuses : known
}

function readSort(value: null | string): NfseInvoiceSortState {
  if (value === null) return null
  const [column, direction] = value.split(SORT_SEPARATOR)
  const known = NFSE_INVOICE_COLUMN_KEYS.find(
    (candidate): candidate is NfseInvoiceColumnKey => candidate === column,
  )
  if (known === undefined) return null
  if (direction !== 'asc' && direction !== 'desc') return null
  return { column: known, direction }
}
