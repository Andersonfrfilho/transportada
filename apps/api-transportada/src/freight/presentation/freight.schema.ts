/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const PERCENTAGE_DECIMAL = /^(?:0|0\.[0-9]{6}|1|1\.000000)$/
const PRIORITY_DECIMAL = /^(?:0|[1-9][0-9]{0,18})$/
const UUID = z.uuid()

const createFreightRuleSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    maximumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    minimumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    name: z.string().trim().min(2).max(100),
    percentage: z.string().regex(PERCENTAGE_DECIMAL),
    priority: z.string().regex(PRIORITY_DECIMAL),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
  })
  .strict()

const simulateFreightSchema = z
  .object({
    documentId: UUID,
  })
  .strict()

export async function parseCreateFreightRuleRequest(request: Request): Promise<{
  readonly description: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: string
  readonly validFrom: string
  readonly validUntil: string | null
}> {
  const result = createFreightRuleSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export function parseFreightCalculationList(url: URL): {
  readonly cursor: string | null
  readonly filters?: {
    readonly baseAmountEq?: string
    readonly baseAmountGt?: string
    readonly baseAmountGte?: string
    readonly baseAmountLt?: string
    readonly baseAmountLte?: string
    readonly baseAmountNe?: string
    readonly calculatedAmountEq?: string
    readonly calculatedAmountGt?: string
    readonly calculatedAmountGte?: string
    readonly calculatedAmountLt?: string
    readonly calculatedAmountLte?: string
    readonly calculatedAmountNe?: string
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly freightRuleIdEq?: string
    readonly freightRuleIdNe?: string
    readonly freightRuleVersionIdEq?: string
    readonly freightRuleVersionIdNe?: string
    readonly maximumAmountEq?: string
    readonly maximumAmountGt?: string
    readonly maximumAmountGte?: string
    readonly maximumAmountLt?: string
    readonly maximumAmountLte?: string
    readonly maximumAmountNe?: string
    readonly minimumAmountEq?: string
    readonly minimumAmountGt?: string
    readonly minimumAmountGte?: string
    readonly minimumAmountLt?: string
    readonly minimumAmountLte?: string
    readonly minimumAmountNe?: string
    readonly percentageEq?: string
    readonly percentageGt?: string
    readonly percentageGte?: string
    readonly percentageLt?: string
    readonly percentageLte?: string
    readonly percentageNe?: string
    readonly ruleVersionEq?: string
    readonly ruleVersionNe?: string
    readonly statusEq?: 'snapshotted' | 'rejected'
    readonly statusNe?: 'snapshotted' | 'rejected'
    readonly totalAmountEq?: string
    readonly totalAmountGt?: string
    readonly totalAmountGte?: string
    readonly totalAmountLt?: string
    readonly totalAmountLte?: string
    readonly totalAmountNe?: string
    readonly updatedFrom?: string
    readonly updatedUntil?: string
  }
  readonly limit: number
} {
  const allowedKeys = new Set([
    'baseAmountEq',
    'baseAmountGt',
    'baseAmountGte',
    'baseAmountLt',
    'baseAmountLte',
    'baseAmountNe',
    'calculatedAmountEq',
    'calculatedAmountGt',
    'calculatedAmountGte',
    'calculatedAmountLt',
    'calculatedAmountLte',
    'calculatedAmountNe',
    'createdFrom',
    'createdUntil',
    'cursor',
    'freightRuleIdEq',
    'freightRuleIdNe',
    'freightRuleVersionIdEq',
    'freightRuleVersionIdNe',
    'limit',
    'maximumAmountEq',
    'maximumAmountGt',
    'maximumAmountGte',
    'maximumAmountLt',
    'maximumAmountLte',
    'maximumAmountNe',
    'minimumAmountEq',
    'minimumAmountGt',
    'minimumAmountGte',
    'minimumAmountLt',
    'minimumAmountLte',
    'minimumAmountNe',
    'percentageEq',
    'percentageGt',
    'percentageGte',
    'percentageLt',
    'percentageLte',
    'percentageNe',
    'ruleVersionEq',
    'ruleVersionNe',
    'statusEq',
    'statusNe',
    'totalAmountEq',
    'totalAmountGt',
    'totalAmountGte',
    'totalAmountLt',
    'totalAmountLte',
    'totalAmountNe',
    'updatedFrom',
    'updatedUntil',
  ])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)
  const filters = {
    baseAmountEq: parseMoney(url.searchParams.get('baseAmountEq')),
    baseAmountGt: parseMoney(url.searchParams.get('baseAmountGt')),
    baseAmountGte: parseMoney(url.searchParams.get('baseAmountGte')),
    baseAmountLt: parseMoney(url.searchParams.get('baseAmountLt')),
    baseAmountLte: parseMoney(url.searchParams.get('baseAmountLte')),
    baseAmountNe: parseMoney(url.searchParams.get('baseAmountNe')),
    calculatedAmountEq: parseMoney(url.searchParams.get('calculatedAmountEq')),
    calculatedAmountGt: parseMoney(url.searchParams.get('calculatedAmountGt')),
    calculatedAmountGte: parseMoney(url.searchParams.get('calculatedAmountGte')),
    calculatedAmountLt: parseMoney(url.searchParams.get('calculatedAmountLt')),
    calculatedAmountLte: parseMoney(url.searchParams.get('calculatedAmountLte')),
    calculatedAmountNe: parseMoney(url.searchParams.get('calculatedAmountNe')),
    createdFrom: parseIsoDateTime(url.searchParams.get('createdFrom')),
    createdUntil: parseIsoDateTime(url.searchParams.get('createdUntil')),
    freightRuleIdEq: parseOptionalUuid(url.searchParams.get('freightRuleIdEq')),
    freightRuleIdNe: parseOptionalUuid(url.searchParams.get('freightRuleIdNe')),
    freightRuleVersionIdEq: parseOptionalUuid(url.searchParams.get('freightRuleVersionIdEq')),
    freightRuleVersionIdNe: parseOptionalUuid(url.searchParams.get('freightRuleVersionIdNe')),
    maximumAmountEq: parseMoney(url.searchParams.get('maximumAmountEq')),
    maximumAmountGt: parseMoney(url.searchParams.get('maximumAmountGt')),
    maximumAmountGte: parseMoney(url.searchParams.get('maximumAmountGte')),
    maximumAmountLt: parseMoney(url.searchParams.get('maximumAmountLt')),
    maximumAmountLte: parseMoney(url.searchParams.get('maximumAmountLte')),
    maximumAmountNe: parseMoney(url.searchParams.get('maximumAmountNe')),
    minimumAmountEq: parseMoney(url.searchParams.get('minimumAmountEq')),
    minimumAmountGt: parseMoney(url.searchParams.get('minimumAmountGt')),
    minimumAmountGte: parseMoney(url.searchParams.get('minimumAmountGte')),
    minimumAmountLt: parseMoney(url.searchParams.get('minimumAmountLt')),
    minimumAmountLte: parseMoney(url.searchParams.get('minimumAmountLte')),
    minimumAmountNe: parseMoney(url.searchParams.get('minimumAmountNe')),
    percentageEq: parsePercentage(url.searchParams.get('percentageEq')),
    percentageGt: parsePercentage(url.searchParams.get('percentageGt')),
    percentageGte: parsePercentage(url.searchParams.get('percentageGte')),
    percentageLt: parsePercentage(url.searchParams.get('percentageLt')),
    percentageLte: parsePercentage(url.searchParams.get('percentageLte')),
    percentageNe: parsePercentage(url.searchParams.get('percentageNe')),
    ruleVersionEq: parsePriority(url.searchParams.get('ruleVersionEq')),
    ruleVersionNe: parsePriority(url.searchParams.get('ruleVersionNe')),
    statusEq: parseCalculationStatus(url.searchParams.get('statusEq')),
    statusNe: parseCalculationStatus(url.searchParams.get('statusNe')),
    totalAmountEq: parseMoney(url.searchParams.get('totalAmountEq')),
    totalAmountGt: parseMoney(url.searchParams.get('totalAmountGt')),
    totalAmountGte: parseMoney(url.searchParams.get('totalAmountGte')),
    totalAmountLt: parseMoney(url.searchParams.get('totalAmountLt')),
    totalAmountLte: parseMoney(url.searchParams.get('totalAmountLte')),
    totalAmountNe: parseMoney(url.searchParams.get('totalAmountNe')),
    updatedFrom: parseIsoDateTime(url.searchParams.get('updatedFrom')),
    updatedUntil: parseIsoDateTime(url.searchParams.get('updatedUntil')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as NonNullable<ReturnType<typeof parseFreightCalculationList>['filters']>)
    : undefined
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

export function parseFreightRuleList(url: URL): {
  readonly cursor: string | null
  readonly filters?: {
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly currentVersionEq?: string
    readonly currentVersionNe?: string
    readonly descriptionContains?: string
    readonly maximumAmountEq?: string
    readonly maximumAmountGt?: string
    readonly maximumAmountGte?: string
    readonly maximumAmountLt?: string
    readonly maximumAmountLte?: string
    readonly maximumAmountNe?: string
    readonly minimumAmountEq?: string
    readonly minimumAmountGt?: string
    readonly minimumAmountGte?: string
    readonly minimumAmountLt?: string
    readonly minimumAmountLte?: string
    readonly minimumAmountNe?: string
    readonly nameContains?: string
    readonly percentageEq?: string
    readonly percentageGt?: string
    readonly percentageGte?: string
    readonly percentageLt?: string
    readonly percentageLte?: string
    readonly percentageNe?: string
    readonly priorityEq?: string
    readonly priorityGt?: string
    readonly priorityGte?: string
    readonly priorityLt?: string
    readonly priorityLte?: string
    readonly priorityNe?: string
    readonly statusEq?: 'draft' | 'active' | 'inactive'
    readonly statusNe?: 'draft' | 'active' | 'inactive'
    readonly typeEq?: 'percentage_of_invoice_total'
    readonly typeNe?: 'percentage_of_invoice_total'
    readonly updatedFrom?: string
    readonly updatedUntil?: string
    readonly validFromFrom?: string
    readonly validFromUntil?: string
    readonly validUntilFrom?: string
    readonly validUntilIsNull?: boolean
    readonly validUntilUntil?: string
  }
  readonly limit: number
} {
  return parseFreightRuleCursorPage(url)
}

export function parseIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

export async function parseSimulateFreightRequest(request: Request): Promise<{
  readonly documentId: string
}> {
  const result = simulateFreightSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
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

function parseFreightRuleCursorPage(url: URL): {
  readonly cursor: string | null
  readonly filters?: {
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly currentVersionEq?: string
    readonly currentVersionNe?: string
    readonly descriptionContains?: string
    readonly maximumAmountEq?: string
    readonly maximumAmountGt?: string
    readonly maximumAmountGte?: string
    readonly maximumAmountLt?: string
    readonly maximumAmountLte?: string
    readonly maximumAmountNe?: string
    readonly minimumAmountEq?: string
    readonly minimumAmountGt?: string
    readonly minimumAmountGte?: string
    readonly minimumAmountLt?: string
    readonly minimumAmountLte?: string
    readonly minimumAmountNe?: string
    readonly nameContains?: string
    readonly percentageEq?: string
    readonly percentageGt?: string
    readonly percentageGte?: string
    readonly percentageLt?: string
    readonly percentageLte?: string
    readonly percentageNe?: string
    readonly priorityEq?: string
    readonly priorityGt?: string
    readonly priorityGte?: string
    readonly priorityLt?: string
    readonly priorityLte?: string
    readonly priorityNe?: string
    readonly statusEq?: 'draft' | 'active' | 'inactive'
    readonly statusNe?: 'draft' | 'active' | 'inactive'
    readonly typeEq?: 'percentage_of_invoice_total'
    readonly typeNe?: 'percentage_of_invoice_total'
    readonly updatedFrom?: string
    readonly updatedUntil?: string
    readonly validFromFrom?: string
    readonly validFromUntil?: string
    readonly validUntilFrom?: string
    readonly validUntilIsNull?: boolean
    readonly validUntilUntil?: string
  }
  readonly limit: number
} {
  const allowedKeys = new Set([
    'createdFrom',
    'createdUntil',
    'cursor',
    'currentVersionEq',
    'currentVersionNe',
    'descriptionContains',
    'limit',
    'maximumAmountEq',
    'maximumAmountGt',
    'maximumAmountGte',
    'maximumAmountLt',
    'maximumAmountLte',
    'maximumAmountNe',
    'minimumAmountEq',
    'minimumAmountGt',
    'minimumAmountGte',
    'minimumAmountLt',
    'minimumAmountLte',
    'minimumAmountNe',
    'nameContains',
    'percentageEq',
    'percentageGt',
    'percentageGte',
    'percentageLt',
    'percentageLte',
    'percentageNe',
    'priorityEq',
    'priorityGt',
    'priorityGte',
    'priorityLt',
    'priorityLte',
    'priorityNe',
    'statusEq',
    'statusNe',
    'typeEq',
    'typeNe',
    'updatedFrom',
    'updatedUntil',
    'validFromFrom',
    'validFromUntil',
    'validUntilFrom',
    'validUntilIsNull',
    'validUntilUntil',
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
    currentVersionEq: parsePriority(url.searchParams.get('currentVersionEq')),
    currentVersionNe: parsePriority(url.searchParams.get('currentVersionNe')),
    descriptionContains: parseContains(url.searchParams.get('descriptionContains')),
    maximumAmountEq: parseMoney(url.searchParams.get('maximumAmountEq')),
    maximumAmountGt: parseMoney(url.searchParams.get('maximumAmountGt')),
    maximumAmountGte: parseMoney(url.searchParams.get('maximumAmountGte')),
    maximumAmountLt: parseMoney(url.searchParams.get('maximumAmountLt')),
    maximumAmountLte: parseMoney(url.searchParams.get('maximumAmountLte')),
    maximumAmountNe: parseMoney(url.searchParams.get('maximumAmountNe')),
    minimumAmountEq: parseMoney(url.searchParams.get('minimumAmountEq')),
    minimumAmountGt: parseMoney(url.searchParams.get('minimumAmountGt')),
    minimumAmountGte: parseMoney(url.searchParams.get('minimumAmountGte')),
    minimumAmountLt: parseMoney(url.searchParams.get('minimumAmountLt')),
    minimumAmountLte: parseMoney(url.searchParams.get('minimumAmountLte')),
    minimumAmountNe: parseMoney(url.searchParams.get('minimumAmountNe')),
    nameContains: parseContains(url.searchParams.get('nameContains')),
    percentageEq: parsePercentage(url.searchParams.get('percentageEq')),
    percentageGt: parsePercentage(url.searchParams.get('percentageGt')),
    percentageGte: parsePercentage(url.searchParams.get('percentageGte')),
    percentageLt: parsePercentage(url.searchParams.get('percentageLt')),
    percentageLte: parsePercentage(url.searchParams.get('percentageLte')),
    percentageNe: parsePercentage(url.searchParams.get('percentageNe')),
    priorityEq: parsePriority(url.searchParams.get('priorityEq')),
    priorityGt: parsePriority(url.searchParams.get('priorityGt')),
    priorityGte: parsePriority(url.searchParams.get('priorityGte')),
    priorityLt: parsePriority(url.searchParams.get('priorityLt')),
    priorityLte: parsePriority(url.searchParams.get('priorityLte')),
    priorityNe: parsePriority(url.searchParams.get('priorityNe')),
    statusEq: parseStatus(url.searchParams.get('statusEq')),
    statusNe: parseStatus(url.searchParams.get('statusNe')),
    typeEq: parseType(url.searchParams.get('typeEq')),
    typeNe: parseType(url.searchParams.get('typeNe')),
    updatedFrom: parseIsoDateTime(url.searchParams.get('updatedFrom')),
    updatedUntil: parseIsoDateTime(url.searchParams.get('updatedUntil')),
    validFromFrom: parseIsoDateTime(url.searchParams.get('validFromFrom')),
    validFromUntil: parseIsoDateTime(url.searchParams.get('validFromUntil')),
    validUntilFrom: parseIsoDateTime(url.searchParams.get('validUntilFrom')),
    validUntilIsNull: parseBoolean(url.searchParams.get('validUntilIsNull')),
    validUntilUntil: parseIsoDateTime(url.searchParams.get('validUntilUntil')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as NonNullable<ReturnType<typeof parseFreightRuleList>['filters']>)
    : undefined
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
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

function parseMoney(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!MONEY_DECIMAL.test(value)) throw invalidRequest()
  return value
}

function parsePercentage(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!PERCENTAGE_DECIMAL.test(value)) throw invalidRequest()
  return value
}

function parsePriority(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!PRIORITY_DECIMAL.test(value)) throw invalidRequest()
  return value
}

function parseStatus(value: string | null): 'draft' | 'active' | 'inactive' | undefined {
  if (value === null) return undefined
  if (value === 'draft' || value === 'active' || value === 'inactive') return value
  throw invalidRequest()
}

function parseType(value: string | null): 'percentage_of_invoice_total' | undefined {
  if (value === null) return undefined
  if (value === 'percentage_of_invoice_total') return value
  throw invalidRequest()
}

function parseCalculationStatus(value: string | null): 'snapshotted' | 'rejected' | undefined {
  if (value === null) return undefined
  if (value === 'snapshotted' || value === 'rejected') return value
  throw invalidRequest()
}

function parseOptionalUuid(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
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
