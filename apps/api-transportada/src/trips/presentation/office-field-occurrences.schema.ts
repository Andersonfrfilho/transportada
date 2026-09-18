/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3/T7b (D7): o lote de ocorrências. Sem `productCode` — no lote a ocorrência é sempre
 * da nota inteira, porque cada nota tem os seus itens. Nota repetida é engano do cliente, e
 * recusado. Multipart desde a T7b: o `file` opcional é a mesma foto para as N notas (D7 §3.5, D9)
 * — validado pelo mesmo teto e tipos do canhoto do escritório, no caso de uso.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  OFFICE_MULTIPART_FILE_FIELD,
  type OfficeForm,
  parseOptionalDriverId,
  readOfficeMultipartFile,
  readOfficeMultipartForm,
} from './office-multipart.schema.js'
import { OCCURRENCE_DESCRIPTION_MAX_LENGTH } from './trip-field-office.schema.js'
import { MAX_BATCH_DOCUMENTS } from './trip-request.schema.js'

const fieldOccurrencesDocumentIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_BATCH_DOCUMENTS)
  .refine((documentIds) => new Set(documentIds).size === documentIds.length)

const fieldOccurrencesNoteSchema = z.string().trim().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH)

const FIELD = {
  documentIds: 'documentIds',
  driverId: 'driverId',
  note: 'note',
  occurrenceTypeId: 'occurrenceTypeId',
} as const

const OCCURRENCES_FIELDS = new Set<string>([...Object.values(FIELD), OFFICE_MULTIPART_FILE_FIELD])

export type OfficeFieldOccurrencesAttachment = {
  readonly bytes: Uint8Array
  readonly mimeType: string
}

function parseDocumentIds(form: OfficeForm): readonly string[] {
  const documentIdsRaw = form.getAll(FIELD.documentIds)
  if (documentIdsRaw.some((value) => typeof value !== 'string')) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
  const documentIds = fieldOccurrencesDocumentIdsSchema.safeParse(documentIdsRaw)
  if (!documentIds.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return documentIds.data
}

function parseNote(form: OfficeForm): string {
  const noteRaw = form.get(FIELD.note)
  if (noteRaw !== null && typeof noteRaw !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
  const note = fieldOccurrencesNoteSchema.safeParse((noteRaw ?? '').trim())
  if (!note.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return note.data
}

export async function parseOfficeFieldOccurrencesRequest(request: Request): Promise<{
  readonly attachment: OfficeFieldOccurrencesAttachment | null
  readonly documentIds: readonly string[]
  readonly driverId: string | undefined
  readonly note: string
  readonly occurrenceTypeId: string
}> {
  const form = await readOfficeMultipartForm({ allowedFields: OCCURRENCES_FIELDS, request })

  const occurrenceTypeIdRaw = form.get(FIELD.occurrenceTypeId)
  if (typeof occurrenceTypeIdRaw !== 'string' || !z.uuid().safeParse(occurrenceTypeIdRaw).success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return {
    attachment: await readOfficeMultipartFile(form),
    documentIds: parseDocumentIds(form),
    driverId: parseOptionalDriverId(form.get(FIELD.driverId)),
    note: parseNote(form),
    occurrenceTypeId: occurrenceTypeIdRaw,
  }
}
