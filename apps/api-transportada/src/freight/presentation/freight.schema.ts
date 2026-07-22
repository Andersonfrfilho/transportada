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
  readonly limit: number
} {
  return parseCursorPage(url)
}

export function parseFreightRuleList(url: URL): {
  readonly cursor: string | null
  readonly limit: number
} {
  return parseCursorPage(url)
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

function parseCursorPage(url: URL): {
  readonly cursor: string | null
  readonly limit: number
} {
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => key !== 'cursor' && key !== 'limit')) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
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
