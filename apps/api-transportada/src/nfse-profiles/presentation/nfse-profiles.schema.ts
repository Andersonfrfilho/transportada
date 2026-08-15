/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  NFSE_EMISSION_PROFILE_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
} from '../../database/nfse.schema.js'
import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES, HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  NfseEmissionProfileFilters,
  NfseEmissionProfileSettings,
  NfseFiscalEnvironment,
} from '../application/nfse-profile.port.js'
import {
  changeProfileStatusSchema,
  createProfileSchema,
  saveCredentialSchema,
  updateProfileSchema,
} from './nfse-profile-request.schema.js'

const DEFAULT_PAGE_LIMIT = 25
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()

const CREDENTIAL_QUERY_KEYS = new Set(['fiscalEnvironment'])
const LIST_QUERY_KEYS = new Set(['cursor', 'limit', 'nameContains', 'statusEq'])

export type SaveCredentialBody = z.infer<typeof saveCredentialSchema>

export async function parseCreateProfileRequest(
  request: Request,
): Promise<{ readonly settings: NfseEmissionProfileSettings }> {
  const result = createProfileSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return { settings: result.data }
}

export async function parseUpdateProfileRequest(request: Request): Promise<{
  readonly expectedVersion: string
  readonly settings: NfseEmissionProfileSettings
}> {
  const result = updateProfileSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export async function parseChangeProfileStatusRequest(request: Request): Promise<{
  readonly expectedVersion: string
  readonly status: 'active' | 'inactive'
}> {
  const result = changeProfileStatusSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export async function parseSaveCredentialRequest(request: Request): Promise<SaveCredentialBody> {
  const result = saveCredentialSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export function parseProfileList(url: URL): {
  readonly cursor: string | null
  readonly filters?: NfseEmissionProfileFilters
  readonly limit: number
} {
  assertQueryKeys({ allowed: LIST_QUERY_KEYS, url })

  const cursor = url.searchParams.get('cursor')
  if (cursor !== null) assertCursor(cursor)
  const limit = url.searchParams.get('limit')
  const filters = {
    nameContains: parseContains(url.searchParams.get('nameContains')),
    statusEq: parseStatus(url.searchParams.get('statusEq')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as NfseEmissionProfileFilters)
    : undefined

  return {
    cursor,
    limit: limit === null ? DEFAULT_PAGE_LIMIT : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

export function parseFiscalEnvironmentQuery(url: URL): NfseFiscalEnvironment {
  assertQueryKeys({ allowed: CREDENTIAL_QUERY_KEYS, url })
  const value = url.searchParams.get('fiscalEnvironment')
  const environment = NFSE_FISCAL_ENVIRONMENTS.find((candidate) => candidate === value)
  if (environment === undefined) throw invalidRequest()
  return environment
}

export function parseIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

export function parseUuidPathIdentifier(value: string): string {
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
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

function assertQueryKeys(input: {
  readonly allowed: ReadonlySet<string>
  readonly url: URL
}): void {
  const entries = [...input.url.searchParams.entries()]
  if (entries.some(([key]) => !input.allowed.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
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
    if (size > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES) {
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

function parseContains(value: string | null): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 100) throw invalidRequest()
  return trimmed
}

function parseLimit(value: string): number {
  if (!PAGE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}

function parseStatus(value: string | null): NfseEmissionProfileFilters['statusEq'] {
  if (value === null) return undefined
  const status = NFSE_EMISSION_PROFILE_STATUSES.find((candidate) => candidate === value)
  if (status === undefined) throw invalidRequest()
  return status
}
