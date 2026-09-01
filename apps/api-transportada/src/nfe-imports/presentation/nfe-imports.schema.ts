/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const UUID = z.uuid()
const ALLOWED_FILE_TYPES = new Set(['application/xml', 'text/xml', 'application/zip'])
const IMPORT_LIST_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/

export type UploadImportFile = {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly name: string
  readonly sha256: string
}

export function parseIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

export async function parseUploadImportRequest(request: Request): Promise<{
  readonly files: readonly UploadImportFile[]
}> {
  assertNoQueryString(request)
  const form = await request.formData()
  const entries = [...form.entries()]
  if (entries.length < 1 || entries.some(([name]) => name !== 'files')) throw invalidRequest()
  const files = await Promise.all(entries.map(async ([, value]) => parseFile(value)))
  return { files }
}

export function parseDistributionRequest(request: Request): void {
  assertNoQueryString(request)
}

export function parseImportList(url: URL): {
  readonly cursor: string | null
  readonly filters?: {
    readonly correlationIdEq?: string
    readonly correlationIdNe?: string
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly duplicatedCountEq?: string
    readonly duplicatedCountGt?: string
    readonly duplicatedCountGte?: string
    readonly duplicatedCountLt?: string
    readonly duplicatedCountLte?: string
    readonly duplicatedCountNe?: string
    readonly failedCountEq?: string
    readonly failedCountGt?: string
    readonly failedCountGte?: string
    readonly failedCountLt?: string
    readonly failedCountLte?: string
    readonly failedCountNe?: string
    readonly idEq?: string
    readonly idNe?: string
    readonly importedCountEq?: string
    readonly importedCountGt?: string
    readonly importedCountGte?: string
    readonly importedCountLt?: string
    readonly importedCountLte?: string
    readonly importedCountNe?: string
    readonly invalidCountEq?: string
    readonly invalidCountGt?: string
    readonly invalidCountGte?: string
    readonly invalidCountLt?: string
    readonly invalidCountLte?: string
    readonly invalidCountNe?: string
    readonly processedCountEq?: string
    readonly processedCountGt?: string
    readonly processedCountGte?: string
    readonly processedCountLt?: string
    readonly processedCountLte?: string
    readonly processedCountNe?: string
    readonly receivedCountEq?: string
    readonly receivedCountGt?: string
    readonly receivedCountGte?: string
    readonly receivedCountLt?: string
    readonly receivedCountLte?: string
    readonly receivedCountNe?: string
    readonly rejectedCountEq?: string
    readonly rejectedCountGt?: string
    readonly rejectedCountGte?: string
    readonly rejectedCountLt?: string
    readonly rejectedCountLte?: string
    readonly rejectedCountNe?: string
    readonly requestedByUserIdEq?: string
    readonly requestedByUserIdNe?: string
    readonly sourceEq?: 'distribution' | 'upload'
    readonly sourceNe?: 'distribution' | 'upload'
    readonly statusEq?:
      | 'pending'
      | 'queued'
      | 'processing'
      | 'completed'
      | 'partially_processed'
      | 'failed'
      | 'cancelled'
    readonly statusNe?:
      | 'pending'
      | 'queued'
      | 'processing'
      | 'completed'
      | 'partially_processed'
      | 'failed'
      | 'cancelled'
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
    'correlationIdEq',
    'correlationIdNe',
    'createdFrom',
    'createdUntil',
    'cursor',
    'duplicatedCountEq',
    'duplicatedCountGt',
    'duplicatedCountGte',
    'duplicatedCountLt',
    'duplicatedCountLte',
    'duplicatedCountNe',
    'failedCountEq',
    'failedCountGt',
    'failedCountGte',
    'failedCountLt',
    'failedCountLte',
    'failedCountNe',
    'idEq',
    'idNe',
    'importedCountEq',
    'importedCountGt',
    'importedCountGte',
    'importedCountLt',
    'importedCountLte',
    'importedCountNe',
    'invalidCountEq',
    'invalidCountGt',
    'invalidCountGte',
    'invalidCountLt',
    'invalidCountLte',
    'invalidCountNe',
    'limit',
    'processedCountEq',
    'processedCountGt',
    'processedCountGte',
    'processedCountLt',
    'processedCountLte',
    'processedCountNe',
    'receivedCountEq',
    'receivedCountGt',
    'receivedCountGte',
    'receivedCountLt',
    'receivedCountLte',
    'receivedCountNe',
    'rejectedCountEq',
    'rejectedCountGt',
    'rejectedCountGte',
    'rejectedCountLt',
    'rejectedCountLte',
    'rejectedCountNe',
    'requestedByUserIdEq',
    'requestedByUserIdNe',
    'sourceEq',
    'sourceNe',
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
    correlationIdEq: parseOpaque(url.searchParams.get('correlationIdEq')),
    correlationIdNe: parseOpaque(url.searchParams.get('correlationIdNe')),
    createdFrom: parseIsoDateTime(url.searchParams.get('createdFrom')),
    createdUntil: parseIsoDateTime(url.searchParams.get('createdUntil')),
    duplicatedCountEq: parsePositiveInteger(url.searchParams.get('duplicatedCountEq')),
    duplicatedCountGt: parsePositiveInteger(url.searchParams.get('duplicatedCountGt')),
    duplicatedCountGte: parsePositiveInteger(url.searchParams.get('duplicatedCountGte')),
    duplicatedCountLt: parsePositiveInteger(url.searchParams.get('duplicatedCountLt')),
    duplicatedCountLte: parsePositiveInteger(url.searchParams.get('duplicatedCountLte')),
    duplicatedCountNe: parsePositiveInteger(url.searchParams.get('duplicatedCountNe')),
    failedCountEq: parsePositiveInteger(url.searchParams.get('failedCountEq')),
    failedCountGt: parsePositiveInteger(url.searchParams.get('failedCountGt')),
    failedCountGte: parsePositiveInteger(url.searchParams.get('failedCountGte')),
    failedCountLt: parsePositiveInteger(url.searchParams.get('failedCountLt')),
    failedCountLte: parsePositiveInteger(url.searchParams.get('failedCountLte')),
    failedCountNe: parsePositiveInteger(url.searchParams.get('failedCountNe')),
    idEq: parseOptionalUuid(url.searchParams.get('idEq')),
    idNe: parseOptionalUuid(url.searchParams.get('idNe')),
    importedCountEq: parsePositiveInteger(url.searchParams.get('importedCountEq')),
    importedCountGt: parsePositiveInteger(url.searchParams.get('importedCountGt')),
    importedCountGte: parsePositiveInteger(url.searchParams.get('importedCountGte')),
    importedCountLt: parsePositiveInteger(url.searchParams.get('importedCountLt')),
    importedCountLte: parsePositiveInteger(url.searchParams.get('importedCountLte')),
    importedCountNe: parsePositiveInteger(url.searchParams.get('importedCountNe')),
    invalidCountEq: parsePositiveInteger(url.searchParams.get('invalidCountEq')),
    invalidCountGt: parsePositiveInteger(url.searchParams.get('invalidCountGt')),
    invalidCountGte: parsePositiveInteger(url.searchParams.get('invalidCountGte')),
    invalidCountLt: parsePositiveInteger(url.searchParams.get('invalidCountLt')),
    invalidCountLte: parsePositiveInteger(url.searchParams.get('invalidCountLte')),
    invalidCountNe: parsePositiveInteger(url.searchParams.get('invalidCountNe')),
    processedCountEq: parsePositiveInteger(url.searchParams.get('processedCountEq')),
    processedCountGt: parsePositiveInteger(url.searchParams.get('processedCountGt')),
    processedCountGte: parsePositiveInteger(url.searchParams.get('processedCountGte')),
    processedCountLt: parsePositiveInteger(url.searchParams.get('processedCountLt')),
    processedCountLte: parsePositiveInteger(url.searchParams.get('processedCountLte')),
    processedCountNe: parsePositiveInteger(url.searchParams.get('processedCountNe')),
    receivedCountEq: parsePositiveInteger(url.searchParams.get('receivedCountEq')),
    receivedCountGt: parsePositiveInteger(url.searchParams.get('receivedCountGt')),
    receivedCountGte: parsePositiveInteger(url.searchParams.get('receivedCountGte')),
    receivedCountLt: parsePositiveInteger(url.searchParams.get('receivedCountLt')),
    receivedCountLte: parsePositiveInteger(url.searchParams.get('receivedCountLte')),
    receivedCountNe: parsePositiveInteger(url.searchParams.get('receivedCountNe')),
    rejectedCountEq: parsePositiveInteger(url.searchParams.get('rejectedCountEq')),
    rejectedCountGt: parsePositiveInteger(url.searchParams.get('rejectedCountGt')),
    rejectedCountGte: parsePositiveInteger(url.searchParams.get('rejectedCountGte')),
    rejectedCountLt: parsePositiveInteger(url.searchParams.get('rejectedCountLt')),
    rejectedCountLte: parsePositiveInteger(url.searchParams.get('rejectedCountLte')),
    rejectedCountNe: parsePositiveInteger(url.searchParams.get('rejectedCountNe')),
    requestedByUserIdEq: parseOptionalUuid(url.searchParams.get('requestedByUserIdEq')),
    requestedByUserIdNe: parseOptionalUuid(url.searchParams.get('requestedByUserIdNe')),
    sourceEq: parseSource(url.searchParams.get('sourceEq')),
    sourceNe: parseSource(url.searchParams.get('sourceNe')),
    statusEq: parseImportStatus(url.searchParams.get('statusEq')),
    statusNe: parseImportStatus(url.searchParams.get('statusNe')),
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
    ? (filters as NonNullable<ReturnType<typeof parseImportList>['filters']>)
    : undefined
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

export function parseUuidPathIdentifier(value: string): string {
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

export function parseReprocessRequest(request: Request): void {
  assertNoQueryString(request)
  if (request.headers.has('idempotency-key')) throw invalidRequest()
}

async function parseFile(value: File | string): Promise<UploadImportFile> {
  if (!(value instanceof File) || value.size === 0) throw invalidRequest()
  if (!ALLOWED_FILE_TYPES.has(value.type)) throw invalidRequest()
  if (!hasAcceptedFileSignature(value)) throw invalidRequest()
  const bytes = new Uint8Array(await value.arrayBuffer())
  return {
    bytes,
    contentType: value.type,
    name: value.name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function hasAcceptedFileSignature(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.xml') || name.endsWith('.zip')
}

/**
 * `extraKeys` é allowlist, não tolerância: a rota que ganha filtro declara a chave dela aqui, e
 * qualquer outra continua sendo `400` — parâmetro ignorado em silêncio é filtro que não filtrou.
 */
export function parseCursorPage(
  url: URL,
  options: { readonly extraKeys?: readonly string[] } = {},
): {
  readonly cursor: string | null
  readonly limit: number
} {
  const allowed = new Set(['cursor', 'limit', ...(options.extraKeys ?? [])])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowed.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)
  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
  }
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

function parseLimit(value: string): number {
  if (!IMPORT_LIST_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}

function parseImportStatus(
  value: string | null,
):
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partially_processed'
  | 'failed'
  | 'cancelled'
  | undefined {
  if (value === null) return undefined
  if (
    value === 'pending' ||
    value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'partially_processed' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value
  }
  throw invalidRequest()
}

function parseIsoDateTime(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.datetime().safeParse(value).success) throw invalidRequest()
  return value
}

function parseOpaque(value: string | null): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 128) throw invalidRequest()
  return trimmed
}

function parseOptionalUuid(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

function parsePositiveInteger(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^(?:0|[1-9][0-9]{0,18})$/.test(value)) throw invalidRequest()
  return value
}

function parseSource(value: string | null): 'distribution' | 'upload' | undefined {
  if (value === null) return undefined
  if (value === 'distribution' || value === 'upload') return value
  throw invalidRequest()
}

function assertNoQueryString(request: Request): void {
  if (new URL(request.url).search !== '') throw invalidRequest()
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
