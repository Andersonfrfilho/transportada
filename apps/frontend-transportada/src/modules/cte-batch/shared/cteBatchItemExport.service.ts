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

/** Mesmo teto de `MAX_BATCH_ID_LIST` na API — a lista de lotes vira um `in (...)`, não uma varredura. */
export const CTE_EXPORT_MAX_BATCHES = 100

/** O ZIP só existe para CT-e autorizado; os chips da listagem não decidem o recorte exportável. */
const CTE_EXPORT_STATUSES: readonly string[] = ['authorized']

const CTE_AUTHORIZED_STATUS = 'authorized'

/** Mesma lista de `CTE_EXPORT_FORMATS` na API — formato fora dela devolve 400. */
export const CTE_EXPORT_FORMATS = ['xml', 'pdf', 'both'] as const
export type CteExportFormat = (typeof CTE_EXPORT_FORMATS)[number]

/** Quem não escolhe continua recebendo o que já recebia antes de o DACTE existir. */
export const CTE_EXPORT_DEFAULT_FORMAT: CteExportFormat = 'xml'

export const CTE_EXPORT_ERROR = {
  BATCH_LIMIT_EXCEEDED: 'CTE_EXPORT_BATCH_LIMIT_EXCEEDED',
  EMPTY_SELECTION: 'CTE_EXPORT_EMPTY_SELECTION',
  LIMIT_EXCEEDED: 'CTE_EXPORT_LIMIT_EXCEEDED',
} as const

export const CTE_EXPORT_UNKNOWN_MESSAGE_KEY = 'cteItems.export.errors.unknown'

const CTE_EXPORT_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  CTE_EXPORT_BATCH_LIMIT_EXCEEDED: 'cteItems.export.errors.batchLimitExceeded',
  CTE_EXPORT_EMPTY: 'cteItems.export.errors.empty',
  CTE_EXPORT_EMPTY_SELECTION: 'cteItems.export.errors.empty',
  CTE_EXPORT_LIMIT_EXCEEDED: 'cteItems.export.errors.limitExceeded',
  DACTE_DOCUMENT_NOT_AUTHORIZED: 'cteItems.export.errors.dacteNotAuthorized',
  DACTE_DOCUMENT_NOT_FOUND: 'cteItems.export.errors.dacteNotFound',
  FORBIDDEN: 'cteItems.export.errors.forbidden',
}

export type CteExportScope = 'filters' | 'selection'

export type CteExportFilterPayload = Readonly<{
  batchId?: string
  batchIdIn?: readonly string[]
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
  format?: CteExportFormat
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
    format?: CteExportFormat
    scope: CteExportScope
    selectedIds: readonly string[]
  }>,
): CteExportRequestBody {
  const format = toFormatPayload(input.format)
  if (input.scope === 'filters') {
    return { filters: serializeCteExportFilters(input.filters), ...format }
  }
  if (input.selectedIds.length === 0) throw new Error(CTE_EXPORT_ERROR.EMPTY_SELECTION)
  if (input.selectedIds.length > CTE_EXPORT_MAX_ITEMS) {
    throw new Error(CTE_EXPORT_ERROR.LIMIT_EXCEEDED)
  }
  return { ...format, itemIds: [...input.selectedIds] }
}

/** Corpo sem `format` é o corpo de antes do DACTE: a API responde o mesmo ZIP de XML. */
function toFormatPayload(
  format: CteExportFormat | undefined,
): Readonly<{ format?: CteExportFormat }> {
  return format === undefined ? {} : { format }
}

/**
 * A seleção de lotes exporta pelo filtro de lotes, não por item: a tela dos lotes não conhece os
 * identificadores dos CT-es, e recortar por `batchIdIn` deixa o corte de autorizados na API.
 */
export function buildCteBatchExportRequest(
  input: Readonly<{ format?: CteExportFormat; selectedBatchIds: readonly string[] }>,
): CteExportRequestBody {
  if (input.selectedBatchIds.length === 0) throw new Error(CTE_EXPORT_ERROR.EMPTY_SELECTION)
  if (input.selectedBatchIds.length > CTE_EXPORT_MAX_BATCHES) {
    throw new Error(CTE_EXPORT_ERROR.BATCH_LIMIT_EXCEEDED)
  }
  return {
    filters: { batchIdIn: [...input.selectedBatchIds], statusIn: CTE_EXPORT_STATUSES },
    ...toFormatPayload(input.format),
  }
}

/** O papel nasce do XML autorizado: sem autorização não há CT-e do qual desenhar o DACTE. */
export function canDownloadCteDacte(
  input: Readonly<{ accessKey: null | string; permissions: readonly string[]; status: string }>,
): boolean {
  if (!canExportCteXml(input)) return false
  return input.status === CTE_AUTHORIZED_STATUS && input.accessKey !== null
}

export function canExportCteBatchSelection(
  input: Readonly<{ permissions: readonly string[]; selectedCount: number }>,
): boolean {
  if (!canExportCteXml(input)) return false
  return input.selectedCount > 0 && input.selectedCount <= CTE_EXPORT_MAX_BATCHES
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
