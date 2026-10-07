/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: a fronteira da prévia. O formulário só aceita `contractorId` e um `file` — o
 * `companyId` vem do contexto e no formulário é 400 —, e todos os problemas voltam juntos com a
 * chave de idempotência. O tamanho é conferido antes de materializar os bytes.
 */
import { z } from 'zod'

import {
  invalidRequest,
  optionalFilter,
  parseOption,
  parseUuidFilter,
  readListQuery,
  readPaging,
  type Paging,
} from '../../http/request-parsing.service.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'
import {
  CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX,
  CARGO_PREVIEW_ITEM_STATES,
  CARGO_PREVIEW_STATUSES,
} from '../../shared/cargo-preview.constant.js'
import type {
  CargoPreviewItemFilters,
  ListCargoPreviewsFilters,
  UploadCargoPreviewInput,
} from '../application/cargo-preview-request.types.js'
import {
  CARGO_PREVIEW_UPLOAD_MAX_BYTES,
  sanitizePreviewFileName,
} from '../domain/cargo-preview-upload.policy.js'
import { CargoPreviewWorkbookError } from '../domain/cargo-preview-workbook.error.js'
import { PREVIEW_TEXT_FIELD_MAX_LENGTH } from '../domain/cargo-preview-workbook.constant.js'
import { IDEMPOTENCY_KEY_HEADER, readIdempotencyKey } from './cargo-arrival.schema.js'

const CONTRACTOR_FIELD = 'contractorId'
const FILE_FIELD = 'file'
const FORM_FIELDS: ReadonlySet<string> = new Set([CONTRACTOR_FIELD, FILE_FIELD])
const AFTER_ROW = /^(?:0|[1-9][0-9]{0,8})$/u
const PAGING_KEYS = ['cursor', 'limit'] as const
const LIST_QUERY_KEYS = new Set<string>(['contractorId', 'status', ...PAGING_KEYS])
const DETAIL_QUERY_KEYS = new Set<string>(['afterRow', 'limit', 'routeName', 'state'])

export const linkCargoPreviewItemSchema = z.object({ documentId: z.uuid() }).strict()

type RequestFormData = Awaited<ReturnType<Request['formData']>>

export type UploadCargoPreviewRequest = {
  readonly idempotencyKey: string
  readonly input: UploadCargoPreviewInput
}

function readFormIssues(form: RequestFormData): {
  readonly contractorId: string
  readonly file: Blob | undefined
  readonly issues: readonly ApiErrorDetail[]
} {
  const issues: ApiErrorDetail[] = []
  for (const key of new Set(form.keys())) {
    if (!FORM_FIELDS.has(key)) issues.push({ field: key, message: 'This field is not accepted' })
  }
  const contractors = form.getAll(CONTRACTOR_FIELD)
  const contractorId = typeof contractors[0] === 'string' ? contractors[0] : ''
  if (contractors.length !== 1 || !z.uuid().safeParse(contractorId).success) {
    issues.push({ field: CONTRACTOR_FIELD, message: 'One contractor id is required' })
  }
  const files = form.getAll(FILE_FIELD)
  const file = files.length === 1 && files[0] instanceof Blob ? files[0] : undefined
  if (file === undefined) issues.push({ field: FILE_FIELD, message: 'One file is required' })
  return { contractorId, file, issues }
}

/** O prefixo das chaves da prévia por e-mail é reservado: o upload não pode colidir com uma mensagem. */
function readUploadKey(request: Request): ReturnType<typeof readIdempotencyKey> {
  const key = readIdempotencyKey(request)
  if (key.issue !== undefined) return key
  if (!key.value.toLowerCase().startsWith(CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX)) return key
  return {
    issue: {
      field: IDEMPOTENCY_KEY_HEADER,
      message: `The "${CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX}" prefix is reserved`,
    },
    value: key.value,
  }
}

export async function parseUploadCargoPreviewRequest(
  request: Request,
): Promise<UploadCargoPreviewRequest> {
  const key = readUploadKey(request)
  const form = await request.formData().catch(() => {
    throw invalidRequest(key.issue === undefined ? [] : [key.issue])
  })
  const { contractorId, file, issues } = readFormIssues(form)
  const allIssues = key.issue === undefined ? issues : [key.issue, ...issues]
  if (allIssues.length > 0 || file === undefined) throw invalidRequest(allIssues)
  if (file.size > CARGO_PREVIEW_UPLOAD_MAX_BYTES) {
    throw new CargoPreviewWorkbookError('PREVIEW_FILE_TOO_LARGE')
  }
  return {
    idempotencyKey: key.value,
    input: {
      bytes: new Uint8Array(await file.arrayBuffer()),
      contractorId,
      fileName: sanitizePreviewFileName(file instanceof File ? file.name : ''),
    },
  }
}

export function parseListCargoPreviewsQuery(url: URL): {
  readonly filters: ListCargoPreviewsFilters
  readonly paging: Paging
} {
  const query = readListQuery(url, LIST_QUERY_KEYS)
  return {
    filters: {
      ...optionalFilter('contractorId', parseUuidFilter(query.get('contractorId'))),
      ...optionalFilter('status', parseOption(query.get('status'), CARGO_PREVIEW_STATUSES)),
    },
    paging: readPaging(query),
  }
}

function parseAfterRow(value: string | null): number | undefined {
  if (value === null) return undefined
  if (!AFTER_ROW.test(value)) throw invalidRequest([{ field: 'afterRow', message: 'Invalid row' }])
  return Number(value)
}

function parseRouteName(value: string | null): string | undefined {
  if (value === null) return undefined
  const routeName = value.trim()
  if (routeName.length === 0 || routeName.length > PREVIEW_TEXT_FIELD_MAX_LENGTH.routeName) {
    throw invalidRequest([{ field: 'routeName', message: 'Invalid route name' }])
  }
  return routeName
}

/** Os itens paginam pela linha da planilha; o limite segue o teto de toda listagem (100). */
export function parseCargoPreviewItemsQuery(url: URL): CargoPreviewItemFilters {
  const query = readListQuery(url, DETAIL_QUERY_KEYS)
  const limit = query.get('limit')
  return {
    ...optionalFilter('afterRow', parseAfterRow(query.get('afterRow'))),
    limit: readPaging(new URLSearchParams(limit === null ? {} : { limit })).limit,
    ...optionalFilter('routeName', parseRouteName(query.get('routeName'))),
    ...optionalFilter('state', parseOption(query.get('state'), CARGO_PREVIEW_ITEM_STATES)),
  }
}
