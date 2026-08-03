/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CTE_SUBMIT_PERMISSION } from './cteBatchItemActions.service'
import {
  parseNumberQuery,
  toIssuedFromInstant,
  toIssuedUntilInstant,
  type CteItemTableFilters,
} from './cteBatchItemTable.service'

/** Mesmo teto de `CTE_EXPORT_MAX_DOCUMENTS` na API — acima dele a requisição volta 422. */
export const CTE_EXPORT_MAX_ITEMS = 500

/** O ZIP só existe para CT-e autorizado; os chips da listagem não decidem o recorte exportável. */
const CTE_EXPORT_STATUSES: readonly string[] = ['authorized']

export const CTE_EXPORT_ERROR = {
  EMPTY_SELECTION: 'CTE_EXPORT_EMPTY_SELECTION',
  LIMIT_EXCEEDED: 'CTE_EXPORT_LIMIT_EXCEEDED',
} as const

export const CTE_EXPORT_UNKNOWN_MESSAGE_KEY = 'cteItems.export.errors.unknown'

const CTE_EXPORT_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  CTE_EXPORT_EMPTY: 'cteItems.export.errors.empty',
  CTE_EXPORT_EMPTY_SELECTION: 'cteItems.export.errors.empty',
  CTE_EXPORT_LIMIT_EXCEEDED: 'cteItems.export.errors.limitExceeded',
  FORBIDDEN: 'cteItems.export.errors.forbidden',
}

export type CteExportScope = 'filters' | 'selection'

export type CteExportFilterPayload = Readonly<{
  batchId?: string
  cteNumberGte?: string
  cteNumberIn?: readonly string[]
  cteNumberLte?: string
  invoiceNumberGte?: string
  invoiceNumberIn?: readonly string[]
  invoiceNumberLte?: string
  issuedFrom?: string
  issuedUntil?: string
  statusIn?: readonly string[]
}>

/** Sem `companyId`: a empresa é a do contexto autenticado e a API rejeita a chave desconhecida. */
export type CteExportRequestBody = Readonly<{
  filters?: CteExportFilterPayload
  itemIds?: readonly string[]
}>

type CteExportFilterDraft = {
  batchId?: string
  cteNumberGte?: string
  cteNumberIn?: readonly string[]
  cteNumberLte?: string
  invoiceNumberGte?: string
  invoiceNumberIn?: readonly string[]
  invoiceNumberLte?: string
  issuedFrom?: string
  issuedUntil?: string
  statusIn?: readonly string[]
}

type NumberQueryKeys = Readonly<{
  gte: 'cteNumberGte' | 'invoiceNumberGte'
  in: 'cteNumberIn' | 'invoiceNumberIn'
  lte: 'cteNumberLte' | 'invoiceNumberLte'
}>

export function serializeCteExportFilters(filters: CteItemTableFilters): CteExportFilterPayload {
  const draft: CteExportFilterDraft = { statusIn: CTE_EXPORT_STATUSES }
  if (filters.batchId.length > 0) draft.batchId = filters.batchId

  const issuedFrom = toIssuedFromInstant(filters.issuedFrom)
  if (issuedFrom.length > 0) draft.issuedFrom = issuedFrom
  const issuedUntil = toIssuedUntilInstant(filters.issuedTo)
  if (issuedUntil.length > 0) draft.issuedUntil = issuedUntil

  applyNumberQuery(draft, filters.cteNumberQuery, {
    gte: 'cteNumberGte',
    in: 'cteNumberIn',
    lte: 'cteNumberLte',
  })
  applyNumberQuery(draft, filters.invoiceNumberQuery, {
    gte: 'invoiceNumberGte',
    in: 'invoiceNumberIn',
    lte: 'invoiceNumberLte',
  })

  return draft
}

function applyNumberQuery(draft: CteExportFilterDraft, raw: string, keys: NumberQueryKeys): void {
  const parsed = parseNumberQuery(raw)
  if (parsed.type === 'exact') draft[keys.in] = [parsed.value]
  if (parsed.type === 'list') draft[keys.in] = [...parsed.values]
  if (parsed.type === 'range') {
    draft[keys.gte] = parsed.from
    draft[keys.lte] = parsed.to
  }
}

export function buildCteExportRequest(
  input: Readonly<{
    filters: CteItemTableFilters
    scope: CteExportScope
    selectedIds: readonly string[]
  }>,
): CteExportRequestBody {
  if (input.scope === 'filters') return { filters: serializeCteExportFilters(input.filters) }
  if (input.selectedIds.length === 0) throw new Error(CTE_EXPORT_ERROR.EMPTY_SELECTION)
  if (input.selectedIds.length > CTE_EXPORT_MAX_ITEMS) {
    throw new Error(CTE_EXPORT_ERROR.LIMIT_EXCEEDED)
  }
  return { itemIds: [...input.selectedIds] }
}

export function canExportCteXml(input: Readonly<{ permissions: readonly string[] }>): boolean {
  return input.permissions.includes(CTE_SUBMIT_PERMISSION)
}

export function canExportCteSelection(
  input: Readonly<{ permissions: readonly string[]; selectedCount: number }>,
): boolean {
  if (!canExportCteXml(input)) return false
  return input.selectedCount > 0 && input.selectedCount <= CTE_EXPORT_MAX_ITEMS
}

export function resolveCteExportMessageKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return CTE_EXPORT_MESSAGE_KEYS[code] ?? CTE_EXPORT_UNKNOWN_MESSAGE_KEY
}
