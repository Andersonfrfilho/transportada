/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const CURSOR = /^[A-Za-z0-9._:-]{1,200}$/
const DOCUMENT = /^[0-9]{11,14}$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const MONEY = /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()

const createBillingInvoiceSchema = z
  .object({
    cteIds: z.array(UUID).min(1).max(100),
    dueDate: z.iso.date(),
  })
  .strict()

const cancelBillingInvoiceSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export type BillingEligibleListInput = {
  readonly batchId?: string
  readonly cteNumber?: string
  readonly cursor: string | null
  readonly customerDocument?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly limit: number
  readonly maxAmount?: string
  readonly minAmount?: string
}

type BillingEligibleListFilters = {
  readonly batchId?: string
  readonly cteNumber?: string
  readonly customerDocument?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly maxAmount?: string
  readonly minAmount?: string
}

export async function parseCreateBillingInvoiceRequest(request: Request): Promise<{
  readonly cteIds: readonly string[]
  readonly dueDate: string
}> {
  const result = createBillingInvoiceSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export async function parseCancelBillingInvoiceRequest(request: Request): Promise<{
  readonly reason: string
}> {
  const result = cancelBillingInvoiceSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export function parseBillingEligibleList(url: URL): BillingEligibleListInput {
  const allowedKeys = new Set([
    'batchId',
    'cteNumber',
    'cursor',
    'customerDocument',
    'issuedFrom',
    'issuedTo',
    'limit',
    'maxAmount',
    'minAmount',
  ])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()

  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)

  const filters = {
    batchId: parseOptionalUuid(url.searchParams.get('batchId')),
    cteNumber: parsePositiveInteger(url.searchParams.get('cteNumber')),
    customerDocument: parseDocument(url.searchParams.get('customerDocument')),
    issuedFrom: parseIsoDate(url.searchParams.get('issuedFrom')),
    issuedTo: parseIsoDate(url.searchParams.get('issuedTo')),
    maxAmount: parseMoney(url.searchParams.get('maxAmount')),
    minAmount: parseMoney(url.searchParams.get('minAmount')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as BillingEligibleListFilters)
    : undefined

  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parsedFilters ?? {}),
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

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}

function parseCursor(value: string): void {
  if (!CURSOR.test(value)) throw invalidRequest()
}

async function parseJsonBody(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.toLowerCase().split(';', 1)[0]?.trim() !==
    'application/json'
  ) {
    throw invalidRequest()
  }
  try {
    return await request.json()
  } catch {
    throw invalidRequest()
  }
}

function parseLimit(value: string): number {
  if (!PAGE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
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

function parseDocument(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!DOCUMENT.test(value)) throw invalidRequest()
  return value
}

function parseIsoDate(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.date().safeParse(value).success) throw invalidRequest()
  return value
}

function parseMoney(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!MONEY.test(value)) throw invalidRequest()
  return value
}
