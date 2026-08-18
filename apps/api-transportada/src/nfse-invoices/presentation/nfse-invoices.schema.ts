/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  MAX_DESCRIPTION_MAX_LENGTH,
  NFSE_CANCELLATION_MOTIVES,
  NFSE_ISS_EXIGIBILITIES,
  NFSE_SERVICE_INVOICE_STATUSES,
} from '../../database/nfse.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import {
  NFSE_EXPORT_FORMATS,
  NFSE_EXPORT_MAX_DOCUMENTS,
} from '../application/export-nfse-documents.port.js'
import type { NfseInvoiceCursor, NfseInvoiceListFilters } from '../application/nfse-invoice.port.js'

/** Uma nota de serviço cobre uma seleção da tela de notas; acima disso o pedido vira lote. */
const MAX_SELECTION_DOCUMENTS = 500

/**
 * O período digitado entra no texto que a prefeitura lê e disputa espaço com a lista de notas —
 * sem teto, uma janela escrita por extenso empurraria as notas para fora da descrição.
 */
const MAX_PERIOD_LENGTH = 60

const CURSOR_SEPARATOR = '::'
const CURSOR_PARTS = 2
const DEFAULT_PAGE_LIMIT = 25
const MAX_CANCELLATION_REASON = 255
const MAX_CORRECTION_TEXT_LENGTH = 40
const MIN_CANCELLATION_REASON = 5
const MIN_CORRECTION_SERVICE_LIST_ITEM = 1
const MAX_CORRECTION_SERVICE_LIST_ITEM = 20
const PAGE_LIMIT = /^(?:[1-9]|[1-9][0-9]|100)$/
const UUID = z.uuid()
const CORRECTION_CNAE = /^[0-9]{7}$/
const CORRECTION_IBGE_CITY = /^[0-9]{7}$/
const CORRECTION_ISS_RATE = /^(?:0\.[0-9]{6}|1\.000000)$/

const LIST_QUERY_KEYS = new Set([
  'createdFrom',
  'createdUntil',
  'cursor',
  'limit',
  'statusIn',
  'takerTaxIdEq',
])

/**
 * Dois campos porque são duas coisas: o **código** é o que a prefeitura lê na transmissão, e o
 * **texto** é o registro de por que a nota saiu do ar, que fica na nota e na tela. Nenhum dos dois
 * substitui o outro — texto livre no lugar do código faz a prefeitura recusar o cancelamento.
 */
export const nfseInvoiceCancellationSchema = z
  .object({
    cancellationMotive: z.enum(NFSE_CANCELLATION_MOTIVES),
    cancellationReason: z.string().trim().min(MIN_CANCELLATION_REASON).max(MAX_CANCELLATION_REASON),
  })
  .strict()

export type NfseInvoiceCancellationBody = z.infer<typeof nfseInvoiceCancellationSchema>

/** Descartar não tem motivo nem correção: o corpo é vazio, e `.strict()` recusa qualquer campo. */
export const nfseInvoiceDiscardSchema = z.object({}).strict()

/**
 * Reemitir sem correção retransmite o RPS congelado tal como está — corpo ausente. Os nove campos
 * corrigíveis da spec são todos opcionais e sem `.default()`: ausência tem de continuar distinguível
 * de valor explícito. `serviceAmount`/`issAmount`/`taker`/`documents` não têm campo — `.strict()` é
 * o que devolve `400` para eles, e também para `companyId`.
 */
export const nfseInvoiceReissueSchema = z
  .object({
    cnaeCode: z.string().regex(CORRECTION_CNAE).optional(),
    description: z.string().trim().min(1).max(MAX_DESCRIPTION_MAX_LENGTH).optional(),
    issExigibility: z.enum(NFSE_ISS_EXIGIBILITIES).optional(),
    issRate: z.string().regex(CORRECTION_ISS_RATE).optional(),
    issWithheld: z.boolean().optional(),
    municipalTaxationCode: z.string().trim().max(MAX_CORRECTION_TEXT_LENGTH).optional(),
    municipalityIbgeCode: z.string().regex(CORRECTION_IBGE_CITY).optional(),
    nbsCode: z.string().trim().max(MAX_CORRECTION_TEXT_LENGTH).optional(),
    serviceListItem: z
      .string()
      .trim()
      .min(MIN_CORRECTION_SERVICE_LIST_ITEM)
      .max(MAX_CORRECTION_SERVICE_LIST_ITEM)
      .optional(),
  })
  .strict()

export type NfseInvoiceReissueBody = z.infer<typeof nfseInvoiceReissueSchema>

export function parseNfseInvoiceList(url: URL): {
  readonly cursor: NfseInvoiceCursor | null
  readonly filters?: NfseInvoiceListFilters
  readonly limit: number
} {
  assertQueryKeys(url)

  const limit = url.searchParams.get('limit')
  const filters = {
    createdFrom: parseInstant(url.searchParams.get('createdFrom')),
    createdUntil: parseInstant(url.searchParams.get('createdUntil')),
    statusIn: parseStatusIn(url.searchParams.get('statusIn')),
    takerTaxIdEq: parseTaxId(url.searchParams.get('takerTaxIdEq')),
  }
  const parsedFilters = Object.values(filters).some((value) => value !== undefined)
    ? (filters as NfseInvoiceListFilters)
    : undefined

  return {
    cursor: parseCursor(url.searchParams.get('cursor')),
    limit: limit === null ? DEFAULT_PAGE_LIMIT : parseLimit(limit),
    ...(parsedFilters === undefined ? {} : { filters: parsedFilters }),
  }
}

export function parseUuidPathIdentifier(value: string): string {
  if (!UUID.safeParse(value).success) throw invalidRequest()
  return value
}

/** O cursor é decodificado na fronteira: o que chega da URL nunca vira filtro sem passar por aqui. */
function parseCursor(value: string | null): NfseInvoiceCursor | null {
  if (value === null) return null

  const parts = value.split(CURSOR_SEPARATOR)
  const [createdAt, id] = parts
  if (parts.length !== CURSOR_PARTS || createdAt === undefined || id === undefined) {
    throw invalidRequest()
  }
  if (new Date(createdAt).toISOString() !== createdAt) throw invalidRequest()
  if (!UUID.safeParse(id).success) throw invalidRequest()

  return { createdAt, id }
}

function assertQueryKeys(url: URL): void {
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !LIST_QUERY_KEYS.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}

function parseInstant(value: string | null): string | undefined {
  if (value === null) return undefined
  if (new Date(value).toISOString() !== value) throw invalidRequest()
  return value
}

function parseLimit(value: string): number {
  if (!PAGE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}

function parseStatusIn(value: string | null): NfseInvoiceListFilters['statusIn'] {
  if (value === null) return undefined

  const requested = value.split(',').map((entry) => entry.trim())
  const statuses = requested.map((entry) =>
    NFSE_SERVICE_INVOICE_STATUSES.find((candidate) => candidate === entry),
  )
  if (statuses.length === 0 || statuses.some((status) => status === undefined)) {
    throw invalidRequest()
  }
  return statuses as NfseInvoiceListFilters['statusIn']
}

function parseTaxId(value: string | null): string | undefined {
  if (value === null) return undefined
  const taxId = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (taxId === undefined) throw invalidRequest()
  return taxId
}

/**
 * `.strict()` de propósito: campo desconhecido no corpo é pedido errado, não campo ignorado — a
 * seleção define o que a prefeitura vai receber, e um `profileID` com erro de digitação aceito em
 * silêncio emitiria a nota pelo perfil errado.
 */
export const nfseInvoiceSelectionSchema = z
  .object({
    descriptionTemplate: z.string().min(1).max(MAX_DESCRIPTION_MAX_LENGTH).optional(),
    documentIds: z.array(z.uuid()).min(1).max(MAX_SELECTION_DOCUMENTS),
    period: z.string().max(MAX_PERIOD_LENGTH).optional(),
    profileId: z.uuid(),
  })
  .strict()

export type NfseInvoiceSelectionBody = z.infer<typeof nfseInvoiceSelectionSchema>

/** O teto da exportação é o mesmo da aplicação: recusar na fronteira poupa a consulta inteira. */
export const nfseInvoiceExportSchema = z
  .object({
    format: z.enum(NFSE_EXPORT_FORMATS).optional(),
    invoiceIds: z.array(z.uuid()).min(1).max(NFSE_EXPORT_MAX_DOCUMENTS),
  })
  .strict()

export type NfseInvoiceExportBody = z.infer<typeof nfseInvoiceExportSchema>

/**
 * O payload congelado que o detalhe expõe em `lastPayload` — mesma forma que o diálogo de
 * reemissão do frontend usa para pré-preencher os campos corrigíveis (spec 042, T013/T014).
 * `null` é a fatura ainda sem tentativa nenhuma.
 */
export const nfseLastIssuancePayloadResponseSchema = z
  .object({
    cnaeCode: z.string(),
    description: z.string(),
    documentCount: z.number(),
    issAmount: z.string(),
    issExigibility: z.enum(NFSE_ISS_EXIGIBILITIES),
    issRate: z.string(),
    issWithheld: z.boolean(),
    municipalTaxationCode: z.string(),
    municipalityIbgeCode: z.string(),
    nbsCode: z.string(),
    serviceAmount: z.string(),
    serviceListItem: z.string(),
    takerLegalName: z.string(),
    takerTaxId: z.string(),
  })
  .strict()
  .nullable()

export type NfseLastIssuancePayloadResponse = z.infer<typeof nfseLastIssuancePayloadResponseSchema>
