/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5: o corpo que o escritório manda espelha o do motorista, com um campo a mais —
 * `driverId`, o motorista escolhido entre os da tripulação (ADR-0067 §2). Sem ele,
 * `resolveFieldTripTarget` cai no de `position = 1`.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import { parseBody, parseOptionalBody } from '../../http/request-parsing.service.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../database/trip.schema.js'
import { DRIVER_RETURN_REASONS } from '../domain/driver-return-reason.policy.js'
import type { OfficeDeliveryProofUpload } from '../application/report-document-delivery.use-case.js'
import { MAX_BATCH_DOCUMENTS } from './trip-request.schema.js'

const OCCURRENCE_DESCRIPTION_MAX_LENGTH = 500
const RECEIVER_NAME_MAX_LENGTH = 120
const ATTACHMENT_KEY_MAX_LENGTH = 128

const driverSelectionSchema = z.object({ driverId: z.uuid().optional() }).strict()

/** ADR-0067 §3: exigido em `field-delivery`/`field-proof`, opcional em `field-return`. */
const deliveredAtSchema = z.iso.datetime()

function parseDeliveredAt(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}

/** Vazio é o caso de fábrica; presente, ele precisa ser CPF ou CNPJ na forma canônica. */
function parseReceiverDocument(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''

  const parsed = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (parsed === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}

const occurrenceSchema = z
  .object({
    description: z.string().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH).optional(),
    /** ADR-0057 §3: `null`/ausente é não aferida, e ela é aceita — distância nunca é porteiro. */
    distanceMeters: z.int().min(0).nullish(),
    documentId: z.uuid().nullish(),
    driverId: z.uuid().optional(),
    kind: z.enum(TRIP_STOP_OCCURRENCE_KINDS),
  })
  .strict()

const arrivalSchema = z
  .object({
    /** Spec 156 T15 A1: quando a chegada aconteceu; ausente é agora (ADR-0067 §3). */
    arrivedAt: z.iso.datetime().optional(),
    driverId: z.uuid().optional(),
  })
  .strict()

/** `POST .../stops/:stopId/arrive`: corpo vazio, o motorista escolhido e/ou a hora da chegada. */
export async function parseOfficeArrivalRequest(request: Request): Promise<{
  readonly arrivedAt: Date | undefined
  readonly driverId: string | undefined
}> {
  const body = await parseOptionalBody(arrivalSchema, request)

  return {
    arrivedAt: body.arrivedAt === undefined ? undefined : parseDeliveredAt(body.arrivedAt),
    driverId: body.driverId,
  }
}

/** `confirm-load` e `start-route`: corpo vazio ou só o motorista escolhido. */
export async function parseOfficeDriverSelection(
  request: Request,
): Promise<{ readonly driverId: string | undefined }> {
  const body = await parseOptionalBody(driverSelectionSchema, request)

  return { driverId: body.driverId }
}

export async function parseOfficeStopOccurrenceRequest(request: Request): Promise<{
  readonly description: string
  readonly distanceMeters: number | null
  readonly documentId: string | null
  readonly driverId: string | undefined
  readonly kind: (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]
}> {
  const body = await parseBody(occurrenceSchema, request)

  return {
    description: body.description ?? '',
    distanceMeters: body.distanceMeters ?? null,
    documentId: body.documentId ?? null,
    driverId: body.driverId,
    kind: body.kind,
  }
}

const officeReturnSchema = z
  .object({
    driverId: z.uuid().optional(),
    reason: z.enum(DRIVER_RETURN_REASONS),
    /** ADR-0067 §3: ausente cai em "agora" — as mesmas travas valem, e "agora" sempre as cumpre. */
    returnedAt: deliveredAtSchema.optional(),
  })
  .strict()

/** Spec 156 T6: `POST .../field-return` — corpo JSON, sem arquivo. */
export async function parseOfficeFieldReturnRequest(request: Request): Promise<{
  readonly driverId: string | undefined
  readonly reason: (typeof DRIVER_RETURN_REASONS)[number]
  readonly returnedAt: Date | undefined
}> {
  const body = await parseBody(officeReturnSchema, request)

  return {
    driverId: body.driverId,
    reason: body.reason,
    returnedAt: body.returnedAt === undefined ? undefined : parseDeliveredAt(body.returnedAt),
  }
}

const FIELD_DELIVERY_FILE_FIELD = 'file'
const FIELD_DELIVERY_RECEIVER_FIELD = 'receiverName'
const FIELD_DELIVERY_RECEIVER_DOCUMENT_FIELD = 'receiverDocument'
const FIELD_DELIVERY_DELIVERED_AT_FIELD = 'deliveredAt'
const FIELD_DELIVERY_DRIVER_ID_FIELD = 'driverId'
const FIELD_DELIVERY_ATTACHMENT_KEY_FIELD = 'attachmentKey'

function parseOptionalDriverId(value: string | File | null): string | undefined {
  if (value === null) return undefined
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (!z.uuid().safeParse(value).success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}

function parseOfficeAttachmentKey(value: string | File | null): string {
  if (typeof value !== 'string') return ''
  if (value.length > ATTACHMENT_KEY_MAX_LENGTH) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}

function parseOfficeReceiverName(value: string | File | null): string {
  if (typeof value !== 'string') return ''
  if (value.length > RECEIVER_NAME_MAX_LENGTH) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}

/**
 * Spec 156 T6, D9: `POST .../field-delivery`. A foto é opcional aqui — quem decide se ela é
 * obrigatória é a configuração da empresa, no caso de uso (aceite 9), nunca o formato do corpo.
 * `kind` nunca é lido do corpo: o canhoto do escritório é sempre `'photo'` (ADR-0067 §5) — quem
 * assina é o motorista, não o escritório.
 */
export async function parseOfficeFieldDeliveryRequest(request: Request): Promise<{
  readonly deliveredAt: Date
  readonly driverId: string | undefined
  readonly proof: OfficeDeliveryProofUpload | null
}> {
  let form: Awaited<ReturnType<Request['formData']>>
  try {
    form = await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const deliveredAtRaw = form.get(FIELD_DELIVERY_DELIVERED_AT_FIELD)
  if (typeof deliveredAtRaw !== 'string' || !deliveredAtSchema.safeParse(deliveredAtRaw).success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const file = form.get(FIELD_DELIVERY_FILE_FIELD)
  if (file !== null && !(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return {
    deliveredAt: parseDeliveredAt(deliveredAtRaw),
    driverId: parseOptionalDriverId(form.get(FIELD_DELIVERY_DRIVER_ID_FIELD)),
    proof:
      file === null
        ? null
        : {
            attachmentKey: parseOfficeAttachmentKey(form.get(FIELD_DELIVERY_ATTACHMENT_KEY_FIELD)),
            bytes: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
            receiverDocument: parseReceiverDocument(
              form.get(FIELD_DELIVERY_RECEIVER_DOCUMENT_FIELD),
            ),
            receiverName: parseOfficeReceiverName(form.get(FIELD_DELIVERY_RECEIVER_FIELD)),
          },
  }
}

/**
 * Spec 156 T6: `POST .../field-proof` — anexa a uma entrega **já feita**. Mesmo corpo de
 * `field-delivery`, sem `deliveredAt`: esta rota nunca muda `delivered_at` (ADR-0067 §2).
 */
export async function parseOfficeFieldProofRequest(request: Request): Promise<{
  readonly driverId: string | undefined
  readonly proof: OfficeDeliveryProofUpload
}> {
  let form: Awaited<ReturnType<Request['formData']>>
  try {
    form = await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const file = form.get(FIELD_DELIVERY_FILE_FIELD)
  if (!(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return {
    driverId: parseOptionalDriverId(form.get(FIELD_DELIVERY_DRIVER_ID_FIELD)),
    proof: {
      attachmentKey: parseOfficeAttachmentKey(form.get(FIELD_DELIVERY_ATTACHMENT_KEY_FIELD)),
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      receiverDocument: parseReceiverDocument(form.get(FIELD_DELIVERY_RECEIVER_DOCUMENT_FIELD)),
      receiverName: parseOfficeReceiverName(form.get(FIELD_DELIVERY_RECEIVER_FIELD)),
    },
  }
}

/**
 * Spec 156 T7.3/T7b (D7): o lote de ocorrências. Sem `productCode` — no lote a ocorrência é sempre
 * da nota inteira, porque cada nota tem os seus itens. Nota repetida é engano do cliente, e
 * recusado. Multipart desde a T7b: o `file` opcional é a mesma foto para as N notas (D7 §3.5,
 * D9) — validado pelo mesmo teto e tipos do canhoto do escritório, no caso de uso.
 */
const fieldOccurrencesDocumentIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_BATCH_DOCUMENTS)
  .refine((documentIds) => new Set(documentIds).size === documentIds.length)

const fieldOccurrencesNoteSchema = z.string().trim().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH)

const FIELD_OCCURRENCES_DOCUMENT_IDS_FIELD = 'documentIds'
const FIELD_OCCURRENCES_OCCURRENCE_TYPE_FIELD = 'occurrenceTypeId'
const FIELD_OCCURRENCES_NOTE_FIELD = 'note'
const FIELD_OCCURRENCES_DRIVER_ID_FIELD = 'driverId'
const FIELD_OCCURRENCES_FILE_FIELD = 'file'

export type OfficeFieldOccurrencesAttachment = {
  readonly bytes: Uint8Array
  readonly mimeType: string
}

export async function parseOfficeFieldOccurrencesRequest(request: Request): Promise<{
  readonly attachment: OfficeFieldOccurrencesAttachment | null
  readonly documentIds: readonly string[]
  readonly driverId: string | undefined
  readonly note: string
  readonly occurrenceTypeId: string
}> {
  let form: Awaited<ReturnType<Request['formData']>>
  try {
    form = await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const allowedFields = new Set([
    FIELD_OCCURRENCES_DOCUMENT_IDS_FIELD,
    FIELD_OCCURRENCES_OCCURRENCE_TYPE_FIELD,
    FIELD_OCCURRENCES_NOTE_FIELD,
    FIELD_OCCURRENCES_DRIVER_ID_FIELD,
    FIELD_OCCURRENCES_FILE_FIELD,
  ])
  for (const key of form.keys())
    if (!allowedFields.has(key)) throw new ApiError(HTTP_ERROR.invalidRequest)

  const documentIdsRaw = form.getAll(FIELD_OCCURRENCES_DOCUMENT_IDS_FIELD)
  if (documentIdsRaw.some((value) => typeof value !== 'string')) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
  const documentIds = fieldOccurrencesDocumentIdsSchema.safeParse(documentIdsRaw)
  if (!documentIds.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const occurrenceTypeIdRaw = form.get(FIELD_OCCURRENCES_OCCURRENCE_TYPE_FIELD)
  if (typeof occurrenceTypeIdRaw !== 'string' || !z.uuid().safeParse(occurrenceTypeIdRaw).success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const noteRaw = form.get(FIELD_OCCURRENCES_NOTE_FIELD)
  if (noteRaw !== null && typeof noteRaw !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
  const note = fieldOccurrencesNoteSchema.safeParse((noteRaw ?? '').toString().trim())
  if (!note.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const file = form.get(FIELD_OCCURRENCES_FILE_FIELD)
  if (file !== null && !(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return {
    attachment:
      file === null
        ? null
        : { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type },
    documentIds: documentIds.data,
    driverId: parseOptionalDriverId(form.get(FIELD_OCCURRENCES_DRIVER_ID_FIELD)),
    note: note.data,
    occurrenceTypeId: occurrenceTypeIdRaw,
  }
}
