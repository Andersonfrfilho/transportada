/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { CTE_ISSUANCE_STATUSES } from '../../database/cte-issuance.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { CTE_BATCH_ITEM_BILLING_STATUSES } from '../application/cte-batch-item.port.js'

const BILLING_STATUSES: ReadonlySet<string> = new Set(CTE_BATCH_ITEM_BILLING_STATUSES)
const ISSUANCE_STATUSES: ReadonlySet<string> = new Set(CTE_ISSUANCE_STATUSES)
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()

const createBatchSchema = z
  .object({
    documentIds: z.array(UUID).min(1).max(100),
    emissionProfileId: UUID.optional(),
    groupingMode: z.enum(['per_invoice', 'sender_recipient']).optional(),
    name: z.string().trim().min(2).max(100),
  })
  .strict()

const previewBatchSchema = z
  .object({
    documentIds: z.array(UUID).min(1).max(100),
    emissionProfileId: UUID.optional(),
    groupingMode: z.enum(['per_invoice', 'sender_recipient']).optional(),
  })
  .strict()

const emptyObjectSchema = z.object({}).strict()

export async function parseCreateCteBatchRequest(request: Request): Promise<{
  readonly documentIds: readonly string[]
  readonly emissionProfileId?: string
  readonly groupingMode?: 'per_invoice' | 'sender_recipient'
  readonly name: string
}> {
  const result = createBatchSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  const { documentIds, emissionProfileId, groupingMode, name } = result.data

  return {
    documentIds,
    name,
    ...(emissionProfileId === undefined ? {} : { emissionProfileId }),
    ...(groupingMode === undefined ? {} : { groupingMode }),
  }
}

export async function parsePreviewCteBatchRequest(request: Request): Promise<{
  readonly documentIds: readonly string[]
  readonly emissionProfileId?: string
  readonly groupingMode?: 'per_invoice' | 'sender_recipient'
}> {
  const result = previewBatchSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  const { documentIds, emissionProfileId, groupingMode } = result.data

  return {
    documentIds,
    ...(emissionProfileId === undefined ? {} : { emissionProfileId }),
    ...(groupingMode === undefined ? {} : { groupingMode }),
  }
}

export async function parseEmptyJsonRequest(request: Request): Promise<void> {
  const result = emptyObjectSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
}

export function parseCteBatchList(url: URL): {
  readonly cursor: string | null
  readonly filters?: {
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly itemCountEq?: string
    readonly itemCountGt?: string
    readonly itemCountGte?: string
    readonly itemCountLt?: string
    readonly itemCountLte?: string
    readonly itemCountNe?: string
    readonly nameContains?: string
    readonly statusEq?: 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'
    readonly statusNe?: 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'
    readonly updatedFrom?: string
    readonly updatedUntil?: string
    readonly versionEq?: string
    readonly versionGt?: string
    readonly versionGte?: string
    readonly versionLt?: string
    readonly versionLte?: string
    readonly versionNe?: string
  }
  readonly limit: number
} {
  const allowedKeys = new Set([
    'createdFrom',
    'createdUntil',
    'cursor',
    'itemCountEq',
    'itemCountGt',
    'itemCountGte',
    'itemCountLt',
    'itemCountLte',
    'itemCountNe',
    'limit',
    'nameContains',
    'statusEq',
    'statusNe',
    'updatedFrom',
    'updatedUntil',
    'versionEq',
    'versionGt',
    'versionGte',
    'versionLt',
    'versionLte',
    'versionNe',
  ])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)
  const filters = {
    createdFrom: parseIsoDateTime(url.searchParams.get('createdFrom')),
    createdUntil: parseIsoDateTime(url.searchParams.get('createdUntil')),
    itemCountEq: parsePositiveInteger(url.searchParams.get('itemCountEq')),
    itemCountGt: parsePositiveInteger(url.searchParams.get('itemCountGt')),
    itemCountGte: parsePositiveInteger(url.searchParams.get('itemCountGte')),
    itemCountLt: parsePositiveInteger(url.searchParams.get('itemCountLt')),
    itemCountLte: parsePositiveInteger(url.searchParams.get('itemCountLte')),
    itemCountNe: parsePositiveInteger(url.searchParams.get('itemCountNe')),
    nameContains: parseContains(url.searchParams.get('nameContains')),
    statusEq: parseBatchStatus(url.searchParams.get('statusEq')),
    statusNe: parseBatchStatus(url.searchParams.get('statusNe')),
    updatedFrom: parseIsoDateTime(url.searchParams.get('updatedFrom')),
    updatedUntil: parseIsoDateTime(url.searchParams.get('updatedUntil')),
    versionEq: parsePositiveInteger(url.searchParams.get('versionEq')),
    versionGt: parsePositiveInteger(url.searchParams.get('versionGt')),
    versionGte: parsePositiveInteger(url.searchParams.get('versionGte')),
    versionLt: parsePositiveInteger(url.searchParams.get('versionLt')),
    versionLte: parsePositiveInteger(url.searchParams.get('versionLte')),
    versionNe: parsePositiveInteger(url.searchParams.get('versionNe')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as NonNullable<ReturnType<typeof parseCteBatchList>['filters']>)
    : undefined
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

export type CteBatchItemListFilters = {
  readonly batchId?: string
  readonly batchIdIn?: readonly string[]
  readonly billingStatusIn?: readonly string[]
  readonly cteNumberGte?: string
  readonly cteNumberIn?: readonly string[]
  readonly cteNumberLte?: string
  readonly invoiceNumberGte?: string
  readonly invoiceNumberIn?: readonly string[]
  readonly invoiceNumberLte?: string
  readonly issuedFrom?: string
  readonly issuedUntil?: string
  readonly statusIn?: readonly string[]
}

export function parseCteBatchItemList(url: URL): {
  readonly cursor: string | null
  readonly filters?: CteBatchItemListFilters
  readonly limit: number
} {
  const allowedKeys = new Set([
    'batchId',
    'batchIdIn',
    'billingStatusIn',
    'cteNumberGte',
    'cteNumberIn',
    'cteNumberLte',
    'cursor',
    'invoiceNumberGte',
    'invoiceNumberIn',
    'invoiceNumberLte',
    'issuedFrom',
    'issuedUntil',
    'limit',
    'statusIn',
  ])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)
  const parsedFilters = parseCteBatchItemFilters((key) => url.searchParams.get(key))

  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

/**
 * Leitura em `string | null` para a mesma validação servir à query string da listagem e ao corpo JSON
 * da exportação — filtro divergente entre as duas entradas viraria exportação fora do que a tela mostra.
 */
export function parseCteBatchItemFilters(
  read: (key: string) => string | null,
): CteBatchItemListFilters | undefined {
  const filters = {
    batchId: parseOptionalUuid(read('batchId')),
    batchIdIn: parseUuidList(read('batchIdIn')),
    billingStatusIn: parseBillingStatusList(read('billingStatusIn')),
    cteNumberGte: parsePositiveInteger(read('cteNumberGte')),
    cteNumberIn: parsePositiveIntegerList(read('cteNumberIn')),
    cteNumberLte: parsePositiveInteger(read('cteNumberLte')),
    invoiceNumberGte: parsePositiveInteger(read('invoiceNumberGte')),
    invoiceNumberIn: parsePositiveIntegerList(read('invoiceNumberIn')),
    invoiceNumberLte: parsePositiveInteger(read('invoiceNumberLte')),
    issuedFrom: parseIsoDateTime(read('issuedFrom')),
    issuedUntil: parseIsoDateTime(read('issuedUntil')),
    statusIn: parseIssuanceStatusList(read('statusIn')),
  }
  assertOrderedNumbers(filters.cteNumberGte, filters.cteNumberLte)
  assertOrderedNumbers(filters.invoiceNumberGte, filters.invoiceNumberLte)
  assertOrderedDates(filters.issuedFrom, filters.issuedUntil)
  assertNotCombinedWithRange(filters.cteNumberIn, filters.cteNumberGte, filters.cteNumberLte)
  assertNotCombinedWithRange(
    filters.invoiceNumberIn,
    filters.invoiceNumberGte,
    filters.invoiceNumberLte,
  )
  if (!Object.values(filters).some((value) => value !== undefined)) return undefined

  return filters as CteBatchItemListFilters
}

export function parseIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

export function parseUuidPathIdentifier(value: string): string {
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

function assertJsonContentType(value: string | null): void {
  if (value?.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') {
    throw invalidRequest()
  }
}

function concatenateChunks(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}

function parseCursor(value: string): void {
  const parts = value.split('::')
  if (parts.length !== 2) throw invalidRequest()
  const createdAt = new Date(parts[0] ?? '')
  const identifier = parts[1] ?? ''
  if (
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== parts[0] ||
    !UUID.safeParse(identifier).success
  ) {
    throw invalidRequest()
  }
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  assertJsonContentType(request.headers.get('content-type'))
  const reader = request.body?.getReader()
  if (reader === undefined) throw invalidRequest()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > 1_048_576) {
      await reader.cancel()
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    chunks.push(next.value)
  }

  try {
    return JSON.parse(new TextDecoder().decode(concatenateChunks(chunks, size)))
  } catch {
    throw invalidRequest()
  }
}

function parseLimit(value: string): number {
  if (!PAGE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}

function parseBatchStatus(
  value: string | null,
): 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled' | undefined {
  if (value === null) return undefined
  if (
    value === 'draft' ||
    value === 'submitted' ||
    value === 'in_flight' ||
    value === 'done' ||
    value === 'error' ||
    value === 'cancelled'
  ) {
    return value
  }
  throw invalidRequest()
}

function parseContains(value: string | null): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 100) throw invalidRequest()
  return trimmed
}

function parseIsoDateTime(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.datetime().safeParse(value).success) throw invalidRequest()
  return value
}

function parsePositiveInteger(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^(?:0|[1-9][0-9]{0,18})$/.test(value)) throw invalidRequest()
  return value
}

function parsePositiveIntegerList(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const values = value.split(',')
  if (values.length === 0 || new Set(values).size !== values.length) throw invalidRequest()
  for (const entry of values) {
    if (!/^(?:0|[1-9][0-9]{0,18})$/.test(entry)) throw invalidRequest()
  }
  return values
}

/** Teto igual ao da criação de lote: a lista vira um `in (...)`, não uma varredura sem limite. */
const MAX_BATCH_ID_LIST = 100

function parseUuidList(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const identifiers = value.split(',')
  if (identifiers.length > MAX_BATCH_ID_LIST) throw invalidRequest()
  if (new Set(identifiers).size !== identifiers.length) throw invalidRequest()
  for (const identifier of identifiers) {
    if (!UUID.safeParse(identifier).success) throw invalidRequest()
  }
  return identifiers
}

function parseOptionalUuid(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

function parseBillingStatusList(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const statuses = value.split(',')
  if (new Set(statuses).size !== statuses.length) throw invalidRequest()
  for (const status of statuses) {
    if (!BILLING_STATUSES.has(status)) throw invalidRequest()
  }
  return statuses
}

function parseIssuanceStatusList(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const statuses = value.split(',')
  if (statuses.length === 0 || new Set(statuses).size !== statuses.length) throw invalidRequest()
  for (const status of statuses) {
    if (!ISSUANCE_STATUSES.has(status)) throw invalidRequest()
  }
  return statuses
}

function assertOrderedNumbers(lower: string | undefined, upper: string | undefined): void {
  if (lower === undefined || upper === undefined) return
  if (BigInt(lower) > BigInt(upper)) throw invalidRequest()
}

function assertOrderedDates(lower: string | undefined, upper: string | undefined): void {
  if (lower === undefined || upper === undefined) return
  if (new Date(lower).getTime() > new Date(upper).getTime()) throw invalidRequest()
}

function assertNotCombinedWithRange(
  list: readonly string[] | undefined,
  lower: string | undefined,
  upper: string | undefined,
): void {
  if (list === undefined) return
  if (lower !== undefined || upper !== undefined) throw invalidRequest()
}
