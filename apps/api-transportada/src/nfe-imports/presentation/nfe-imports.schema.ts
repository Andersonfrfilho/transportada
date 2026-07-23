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
  readonly limit: number
} {
  return parseCursorPage(url)
}

export function parseDocumentList(url: URL): {
  readonly cursor: string | null
  readonly limit: number
} {
  return parseCursorPage(url)
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

function assertNoQueryString(request: Request): void {
  if (new URL(request.url).search !== '') throw invalidRequest()
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
