/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { BILLING_INVOICE_STATUSES } from '../../database/billing.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { DOCUMENT_FILTER_PATTERN, parseTaxIdValue } from '../../shared/tax-id.service.js'
import { BILLING_MAX_CTES_PER_INVOICE } from '../domain/invoice-limits.constant.js'

const BILLING_INVOICE_STATUS_SET: ReadonlySet<string> = new Set(BILLING_INVOICE_STATUSES)
const CURSOR = /^[A-Za-z0-9._:-]{1,200}$/
const FISCAL_NUMBER = /^[1-9][0-9]{0,8}$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const MONEY = /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()
const CUSTOMER_NAME_MAX_LENGTH = 120
const CUSTOMER_NAME_MIN_LENGTH = 2
const LIST_FILTER_MAX_VALUES = 100
const OBSERVATIONS_MAX_LENGTH = 500
const ELIGIBLE_LIST_KEYS: ReadonlySet<string> = new Set([
  'batchId',
  'batchIdIn',
  'cteNumber',
  'cteNumberFrom',
  'cteNumberIn',
  'cteNumberTo',
  'cursor',
  'customerDocument',
  'customerName',
  'issuedFrom',
  'issuedTo',
  'limit',
  'maxAmount',
  'minAmount',
  'nfeNumberFrom',
  'nfeNumberIn',
  'nfeNumberTo',
])
const ELIGIBLE_LIST_CONFLICTS: readonly (readonly [string, string])[] = [
  ['batchId', 'batchIdIn'],
  ['cteNumber', 'cteNumberIn'],
  ['cteNumber', 'cteNumberFrom'],
  ['cteNumber', 'cteNumberTo'],
]
const ELIGIBLE_LIST_RANGES: readonly (readonly [string, string])[] = [
  ['cteNumberFrom', 'cteNumberTo'],
  ['nfeNumberFrom', 'nfeNumberTo'],
]
const INVOICE_LIST_KEYS: ReadonlySet<string> = new Set([
  'cursor',
  'customerDocument',
  'customerDocumentIn',
  'dueFrom',
  'dueTo',
  'invoiceNumber',
  'invoiceNumberFrom',
  'invoiceNumberIn',
  'invoiceNumberTo',
  'issuedFrom',
  'issuedTo',
  'limit',
  'status',
  'statusIn',
])
const INVOICE_LIST_CONFLICTS: readonly (readonly [string, string])[] = [
  ['customerDocument', 'customerDocumentIn'],
  ['invoiceNumber', 'invoiceNumberIn'],
  ['invoiceNumber', 'invoiceNumberFrom'],
  ['invoiceNumber', 'invoiceNumberTo'],
  ['status', 'statusIn'],
]
const INVOICE_LIST_RANGES: readonly (readonly [string, string])[] = [
  ['invoiceNumberFrom', 'invoiceNumberTo'],
]

const createBillingInvoiceSchema = z
  .object({
    cteIds: z.array(UUID).min(1).max(BILLING_MAX_CTES_PER_INVOICE),
    dueDate: z.iso.date(),
  })
  .strict()

const previewBillingInvoiceSchema = z
  .object({
    cteIds: z
      .array(UUID)
      .min(1)
      .max(BILLING_MAX_CTES_PER_INVOICE)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict()

const cancelBillingInvoiceSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

const updateBillingInvoiceSchema = z
  .object({
    discountAmount: z.string().regex(MONEY).optional(),
    observations: z.string().max(OBSERVATIONS_MAX_LENGTH).optional(),
    surchargeAmount: z.string().regex(MONEY).optional(),
  })
  .strict()
  // Um PATCH vazio não é edição: recusar em vez de gravar a fatura inalterada.
  .refine((value) => Object.keys(value).length > 0)

export type BillingEligibleListInput = {
  readonly batchId?: string
  readonly batchIdIn?: readonly string[]
  readonly cteNumber?: string
  readonly cteNumberFrom?: string
  readonly cteNumberIn?: readonly string[]
  readonly cteNumberTo?: string
  readonly cursor: string | null
  readonly customerDocument?: string
  readonly customerName?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly limit: number
  readonly maxAmount?: string
  readonly minAmount?: string
  readonly nfeNumberFrom?: string
  readonly nfeNumberIn?: readonly string[]
  readonly nfeNumberTo?: string
}

type BillingEligibleListFilters = {
  readonly batchId?: string
  readonly batchIdIn?: readonly string[]
  readonly cteNumber?: string
  readonly cteNumberFrom?: string
  readonly cteNumberIn?: readonly string[]
  readonly cteNumberTo?: string
  readonly customerDocument?: string
  readonly customerName?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly maxAmount?: string
  readonly minAmount?: string
  readonly nfeNumberFrom?: string
  readonly nfeNumberIn?: readonly string[]
  readonly nfeNumberTo?: string
}

export async function parseCreateBillingInvoiceRequest(request: Request): Promise<{
  readonly cteIds: readonly string[]
  readonly dueDate: string
}> {
  const result = createBillingInvoiceSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export async function parseBillingInvoicePreviewRequest(request: Request): Promise<{
  readonly cteIds: readonly string[]
}> {
  const result = previewBillingInvoiceSchema.safeParse(await parseJsonBody(request))
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

export async function parseUpdateBillingInvoiceRequest(request: Request): Promise<{
  readonly discountAmount?: string | undefined
  readonly observations?: string | undefined
  readonly surchargeAmount?: string | undefined
}> {
  const result = updateBillingInvoiceSchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

export function parseBillingEligibleList(url: URL): BillingEligibleListInput {
  assertListQueryKeys({
    allowedKeys: ELIGIBLE_LIST_KEYS,
    conflicts: ELIGIBLE_LIST_CONFLICTS,
    ranges: ELIGIBLE_LIST_RANGES,
    url,
  })

  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)

  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parseEligibleListFilters(url) ?? {}),
  }
}

function assertListQueryKeys(
  input: Readonly<{
    allowedKeys: ReadonlySet<string>
    conflicts: readonly (readonly [string, string])[]
    ranges: readonly (readonly [string, string])[]
    url: URL
  }>,
): void {
  const entries = [...input.url.searchParams.entries()]
  if (entries.some(([key]) => !input.allowedKeys.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  // Filtro de lista e filtro exato do mesmo domínio se anulariam — recusar em vez de eleger um.
  for (const [exactKey, listKey] of input.conflicts) {
    if (input.url.searchParams.has(exactKey) && input.url.searchParams.has(listKey)) {
      throw invalidRequest()
    }
  }
  // Faixa pela metade filtraria por um lado só, sem o operador ter pedido isso.
  for (const [fromKey, toKey] of input.ranges) {
    if (input.url.searchParams.has(fromKey) !== input.url.searchParams.has(toKey)) {
      throw invalidRequest()
    }
  }
}

function parseEligibleListFilters(url: URL): BillingEligibleListFilters | undefined {
  const range = parseFiscalNumberRange(
    url.searchParams.get('cteNumberFrom'),
    url.searchParams.get('cteNumberTo'),
  )
  const nfeRange = parseFiscalNumberRange(
    url.searchParams.get('nfeNumberFrom'),
    url.searchParams.get('nfeNumberTo'),
  )
  const filters = {
    batchId: parseOptionalUuid(url.searchParams.get('batchId')),
    batchIdIn: parseUuidList(url.searchParams.get('batchIdIn')),
    cteNumber: parseFiscalNumber(url.searchParams.get('cteNumber')),
    cteNumberFrom: range?.from,
    cteNumberIn: parseFiscalNumberList(url.searchParams.get('cteNumberIn')),
    cteNumberTo: range?.to,
    customerDocument: parseDocument(url.searchParams.get('customerDocument')),
    customerName: parseCustomerName(url.searchParams.get('customerName')),
    issuedFrom: parseIsoDate(url.searchParams.get('issuedFrom')),
    issuedTo: parseIsoDate(url.searchParams.get('issuedTo')),
    maxAmount: parseMoney(url.searchParams.get('maxAmount')),
    minAmount: parseMoney(url.searchParams.get('minAmount')),
    nfeNumberFrom: nfeRange?.from,
    nfeNumberIn: parseFiscalNumberList(url.searchParams.get('nfeNumberIn')),
    nfeNumberTo: nfeRange?.to,
  }
  return Object.values(filters).some((value) => value !== undefined)
    ? (filters as BillingEligibleListFilters)
    : undefined
}

export type BillingInvoiceListInput = {
  readonly cursor: string | null
  readonly customerDocument?: string
  readonly customerDocumentIn?: readonly string[]
  readonly dueFrom?: string
  readonly dueTo?: string
  readonly invoiceNumber?: string
  readonly invoiceNumberFrom?: string
  readonly invoiceNumberIn?: readonly string[]
  readonly invoiceNumberTo?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly limit: number
  readonly status?: string
  readonly statusIn?: readonly string[]
}

export type BillingInvoiceListFilters = Omit<BillingInvoiceListInput, 'cursor' | 'limit'>

const INVOICE_PAGING_KEYS: ReadonlySet<string> = new Set(['cursor', 'limit'])

/**
 * O composition root repassa os filtros ao caso de uso; derivá-los por resto impede que uma chave
 * aceita pela rota suma no caminho até a query.
 */
export function toBillingInvoiceListFilters(
  input: BillingInvoiceListInput,
): BillingInvoiceListFilters {
  const entries = Object.entries(input).filter(([key]) => !INVOICE_PAGING_KEYS.has(key))
  return Object.fromEntries(entries) as BillingInvoiceListFilters
}

export function parseBillingInvoiceList(url: URL): BillingInvoiceListInput {
  assertListQueryKeys({
    allowedKeys: INVOICE_LIST_KEYS,
    conflicts: INVOICE_LIST_CONFLICTS,
    ranges: INVOICE_LIST_RANGES,
    url,
  })

  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  if (cursor !== null) parseCursor(cursor)

  return {
    cursor,
    limit: limit === null ? 25 : parseLimit(limit),
    ...(parseInvoiceListFilters(url) ?? {}),
  }
}

function parseInvoiceListFilters(url: URL): BillingInvoiceListFilters | undefined {
  const numberRange = parsePositiveIntegerRange(
    url.searchParams.get('invoiceNumberFrom'),
    url.searchParams.get('invoiceNumberTo'),
  )
  const filters = {
    customerDocument: parseDocument(url.searchParams.get('customerDocument')),
    customerDocumentIn: parseDocumentList(url.searchParams.get('customerDocumentIn')),
    dueFrom: parseIsoDate(url.searchParams.get('dueFrom')),
    dueTo: parseIsoDate(url.searchParams.get('dueTo')),
    invoiceNumber: parsePositiveInteger(url.searchParams.get('invoiceNumber')),
    invoiceNumberFrom: numberRange?.from,
    invoiceNumberIn: parsePositiveIntegerList(url.searchParams.get('invoiceNumberIn')),
    invoiceNumberTo: numberRange?.to,
    issuedFrom: parseIsoDate(url.searchParams.get('issuedFrom')),
    issuedTo: parseIsoDate(url.searchParams.get('issuedTo')),
    status: parseInvoiceStatus(url.searchParams.get('status')),
    statusIn: parseInvoiceStatusList(url.searchParams.get('statusIn')),
  }
  return Object.values(filters).some((value) => value !== undefined)
    ? (filters as BillingInvoiceListFilters)
    : undefined
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

function parsePositiveIntegerList(value: string | null): readonly string[] | undefined {
  const values = parseListValues(value)
  if (values === undefined) return undefined
  for (const item of values) parsePositiveInteger(item)
  return values
}

/** Faixa invertida não devolve nada: é erro de digitação, não uma consulta legítima vazia. */
function parsePositiveIntegerRange(
  from: string | null,
  to: string | null,
): { readonly from: string; readonly to: string } | undefined {
  const parsedFrom = parsePositiveInteger(from)
  const parsedTo = parsePositiveInteger(to)
  if (parsedFrom === undefined || parsedTo === undefined) return undefined
  if (BigInt(parsedFrom) > BigInt(parsedTo)) throw invalidRequest()
  return { from: parsedFrom, to: parsedTo }
}

function parseDocumentList(value: string | null): readonly string[] | undefined {
  const values = parseListValues(value)
  if (values === undefined) return undefined
  return values.map(normalizeDocument)
}

/** Status repetido na lista não muda o resultado, mas denuncia consulta montada errado. */
function parseInvoiceStatusList(value: string | null): readonly string[] | undefined {
  const values = parseListValues(value)
  if (values === undefined) return undefined
  if (new Set(values).size !== values.length) throw invalidRequest()
  for (const item of values) parseInvoiceStatus(item)
  return values
}

function parseListValues(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined
  const values = value.split(',')
  if (values.length > LIST_FILTER_MAX_VALUES) throw invalidRequest()
  return values
}

function parseUuidList(value: string | null): readonly string[] | undefined {
  const values = parseListValues(value)
  if (values === undefined) return undefined
  for (const item of values) {
    if (!UUID.safeParse(item).success) throw invalidRequest()
  }
  return values
}

/** `nCT` tem 9 dígitos no leiaute fiscal: número maior nunca corresponde a um CT-e emitido. */
function parseFiscalNumber(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!FISCAL_NUMBER.test(value)) throw invalidRequest()
  return value
}

function parseFiscalNumberList(value: string | null): readonly string[] | undefined {
  const values = parseListValues(value)
  if (values === undefined) return undefined
  for (const item of values) parseFiscalNumber(item)
  return values
}

/** Faixa invertida não devolve nada: é erro de digitação, não uma consulta legítima vazia. */
function parseFiscalNumberRange(
  from: string | null,
  to: string | null,
): { readonly from: string; readonly to: string } | undefined {
  const parsedFrom = parseFiscalNumber(from)
  const parsedTo = parseFiscalNumber(to)
  if (parsedFrom === undefined || parsedTo === undefined) return undefined
  if (BigInt(parsedFrom) > BigInt(parsedTo)) throw invalidRequest()
  return { from: parsedFrom, to: parsedTo }
}

function parseCustomerName(value: string | null): string | undefined {
  if (value === null) return undefined
  const name = value.trim()
  if (name.length < CUSTOMER_NAME_MIN_LENGTH || name.length > CUSTOMER_NAME_MAX_LENGTH) {
    throw invalidRequest()
  }
  return name
}

function parseDocument(value: string | null): string | undefined {
  if (value === null) return undefined
  return normalizeDocument(value)
}

function normalizeDocument(value: string): string {
  const document = parseTaxIdValue(value, DOCUMENT_FILTER_PATTERN)
  if (document === undefined) throw invalidRequest()
  return document
}

function parseIsoDate(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.date().safeParse(value).success) throw invalidRequest()
  return value
}

function parseInvoiceStatus(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!BILLING_INVOICE_STATUS_SET.has(value)) throw invalidRequest()
  return value
}

function parseMoney(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!MONEY.test(value)) throw invalidRequest()
  return value
}
