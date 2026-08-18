/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES, HTTP_ERROR } from '../shared/api.constant.js'
import { ApiError } from '../shared/api.error.js'
import type { ApiErrorDetail } from '../shared/api.types.js'

const CONTAINS_MAX_LENGTH = 60
const DEFAULT_PAGE_LIMIT = 25
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()

export type Paging = {
  readonly cursor: string | null
  readonly limit: number
}

export function invalidRequest(details?: readonly ApiErrorDetail[]): ApiError {
  return new ApiError({ ...HTTP_ERROR.invalidRequest, ...(details ? { details } : {}) })
}

export function hasFilter(filters: object): boolean {
  return Object.keys(filters).length > 0
}

export function optionalFilter<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): Partial<Record<TKey, TValue>> {
  return value === undefined ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export async function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  request: Request,
): Promise<z.infer<TSchema>> {
  return parseAgainstSchema(schema, await parseJsonBody(request))
}

/**
 * Rota cujo corpo é vazio ou opcional. `fetch` não manda `content-type` em `POST` sem body, e
 * exigi-lo recusava com `400` exatamente o pedido que o cliente monta — foi assim que o descarte
 * e a reemissão sem correção nasceram quebrados. Corpo ausente vale como `{}`; corpo presente
 * passa pelo mesmo caminho estrito de sempre, e bytes sem `content-type` continuam recusados.
 */
export async function parseOptionalBody<TSchema extends z.ZodType>(
  schema: TSchema,
  request: Request,
): Promise<z.infer<TSchema>> {
  if (request.headers.get('content-type') !== null) return parseBody(schema, request)
  if ((await readRequestBytes(request)).byteLength > 0) throw invalidRequest()
  return parseAgainstSchema(schema, {})
}

function parseAgainstSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw invalidRequest(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
  return result.data
}

export function parseContains(value: string | null): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > CONTAINS_MAX_LENGTH) throw invalidRequest()
  return trimmed
}

export function parseOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
): TOption | undefined {
  if (value === null) return undefined
  const option = options.find((candidate) => candidate === value)
  if (option === undefined) throw invalidRequest()
  return option
}

export function parseUuidFilter(value: string | null): string | undefined {
  if (value === null) return undefined
  return parseUuidPathIdentifier(value)
}

export function parseUuidPathIdentifier(value: string): string {
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

export function readListQuery(url: URL, allowedKeys: ReadonlySet<string>): URLSearchParams {
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  return url.searchParams
}

export function readPaging(parameters: URLSearchParams): Paging {
  const cursor = parameters.get('cursor')
  if (cursor !== null) assertCursor(cursor)
  return { cursor, limit: parseLimit(parameters.get('limit')) }
}

function assertCursor(value: string): void {
  const parts = value.split('::')
  const createdAt = new Date(parts[0] ?? '')
  if (
    parts.length !== 2 ||
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== parts[0] ||
    !UUID.safeParse(parts[1] ?? '').success
  ) {
    throw invalidRequest()
  }
}

function assertJsonContentType(value: string | null): void {
  if (value?.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') throw invalidRequest()
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

async function readRequestBytes(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (reader === undefined) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES) {
      await reader.cancel()
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    chunks.push(next.value)
  }
  return concatenateChunks(chunks, size)
}

async function parseJsonBody(request: Request): Promise<unknown> {
  assertJsonContentType(request.headers.get('content-type'))
  // A leitura fica fora do `try`: o 413 do corpo grande não pode ser reescrito como 400 de JSON ruim
  const bytes = await readRequestBytes(request)
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw invalidRequest()
  }
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_PAGE_LIMIT
  if (!PAGE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}
