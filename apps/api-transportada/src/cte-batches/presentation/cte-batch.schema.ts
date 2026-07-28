/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

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

async function parseJsonBody(request: Request): Promise<unknown> {
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
