/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a fronteira da avaria sem viagem e da marcação. O multipart é o mesmo da ocorrência
 * de galpão (spec 161: lista fechada, um `file`, no máximo um `thumbnail`), a chave de idempotência é
 * a da chegada, e a etapa nunca vem do cliente — é do tipo cadastrado.
 */
import { z } from 'zod'

import {
  invalidRequest,
  parseBody,
  parseOptionalBody,
  readListQuery,
} from '../../http/request-parsing.service.js'
import { parseRegisterOccurrenceMultipartRequest } from '../../trips/presentation/occurrence.schema.js'
import type { RegisterCargoArrivalOccurrenceParams } from '../application/cargo-arrival-occurrence.types.js'
import { readIdempotencyKey } from './cargo-arrival.schema.js'

type MultipartFields = Omit<
  RegisterCargoArrivalOccurrenceParams,
  'arrivalId' | 'context' | 'correlationId' | 'documentId'
>

const RETURN_NOTE_MAX_LENGTH = 500
const DOCUMENT_ID_QUERY_KEY = 'documentId'
const OCCURRENCE_LIST_QUERY_KEYS: ReadonlySet<string> = new Set([DOCUMENT_ID_QUERY_KEY])

const noteSchema = z.string().trim().max(RETURN_NOTE_MAX_LENGTH).default('')

const markReturnSchema = z.object({ note: noteSchema, occurrenceId: z.uuid() }).strict()
const changeReturnSchema = z.object({ note: noteSchema }).strict()

/** A chave que falta é 400 antes de ler o corpo: nada é aceito sem poder ser reenviado com segurança. */
export async function parseCargoArrivalOccurrenceRequest(
  request: Request,
): Promise<MultipartFields> {
  const key = readIdempotencyKey(request)
  if (key.issue !== undefined) throw invalidRequest([key.issue])
  const body = await parseRegisterOccurrenceMultipartRequest(request)
  return {
    attachment: body.attachment,
    idempotencyKey: key.value,
    note: body.note,
    occurrenceTypeId: body.occurrenceTypeId,
    productCode: body.productCode,
    productCodes: body.productCodes,
    productQuantities: body.productQuantities,
    productQuantityUnits: body.productQuantityUnits,
  }
}

export async function parseMarkReturnRequest(
  request: Request,
): Promise<{ readonly note: string; readonly occurrenceId: string }> {
  return parseBody(markReturnSchema, request)
}

export async function parseChangeReturnRequest(
  request: Request,
): Promise<{ readonly note: string }> {
  return parseOptionalBody(changeReturnSchema, request)
}

export function parseOccurrenceListQuery(url: URL): string | null {
  const documentId = readListQuery(url, OCCURRENCE_LIST_QUERY_KEYS).get(DOCUMENT_ID_QUERY_KEY)
  if (documentId === null) return null
  if (!z.uuid().safeParse(documentId).success) throw invalidRequest()
  return documentId
}
