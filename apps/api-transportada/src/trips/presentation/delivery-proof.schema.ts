/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  TRIP_DELIVERY_PROOF_KINDS,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type { ProofPosition } from '../domain/delivery-proof-punctuality.policy.js'
import type { DeliveryProofUpload } from '../application/attach-delivery-proof.use-case.js'

const FILE_FIELD = 'file'
const KIND_FIELD = 'kind'
const RECEIVER_FIELD = 'receiverName'
/** ADR-0057 §3: o documento só entra quando a configuração da empresa pede — quem decide é o caso de uso. */
const RECEIVER_DOCUMENT_FIELD = 'receiverDocument'
/** Spec 082 (revisão, item 5): chave de idempotência opcional do anexo. */
const ATTACHMENT_KEY_FIELD = 'attachmentKey'
const ATTACHMENT_KEY_MAX_LENGTH = 128
const RECEIVER_NAME_MAX_LENGTH = 120
/** ADR-0068 §2-4, spec 157 RF3: onde e quando a foto foi tirada — os quatro campos são opcionais. */
const LATITUDE_FIELD = 'latitude'
const LONGITUDE_FIELD = 'longitude'
const ACCURACY_METERS_FIELD = 'accuracyMeters'
const CAPTURED_AT_FIELD = 'capturedAt'

const capturedAtSchema = z.iso.datetime()

function isProofKind(value: unknown): value is TripDeliveryProofKind {
  return (
    typeof value === 'string' && (TRIP_DELIVERY_PROOF_KINDS as readonly string[]).includes(value)
  )
}

/**
 * O tipo e o tamanho são conferidos pelo caso de uso, não aqui: a recusa deles é **de negócio** (o
 * anexo não entra e a entrega continua de pé), e devolvê-la como `400` de formulário perderia o
 * código estável que a tela do motorista traduz.
 */
export async function parseDeliveryProofUpload(request: Request): Promise<DeliveryProofUpload> {
  // O tipo do `FormData` do runtime diverge do global; o do próprio `Request` é o que compila.
  let form: Awaited<ReturnType<Request['formData']>>
  try {
    form = await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const file = form.get(FILE_FIELD)
  const kind = form.get(KIND_FIELD)
  if (!(file instanceof File) || !isProofKind(kind)) throw new ApiError(HTTP_ERROR.invalidRequest)

  const receiverName = form.get(RECEIVER_FIELD)
  if (typeof receiverName === 'string' && receiverName.length > RECEIVER_NAME_MAX_LENGTH) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const attachmentKey = form.get(ATTACHMENT_KEY_FIELD)
  if (typeof attachmentKey === 'string' && attachmentKey.length > ATTACHMENT_KEY_MAX_LENGTH) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return {
    attachmentKey: typeof attachmentKey === 'string' ? attachmentKey : '',
    bytes: new Uint8Array(await file.arrayBuffer()),
    capturedAt: parseCapturedAt(form.get(CAPTURED_AT_FIELD)),
    kind,
    mimeType: file.type,
    position: parsePosition(form),
    receiverDocument: parseReceiverDocument(form.get(RECEIVER_DOCUMENT_FIELD)),
    receiverName: typeof receiverName === 'string' ? receiverName : '',
  }
}

/** RF3: `capturedAt` é opcional, mas quando vem precisa ser um `datetime` ISO válido. */
function parseCapturedAt(value: unknown): Date | undefined {
  if (value === null) return undefined
  if (typeof value !== 'string' || value.length === 0) return undefined

  const parsed = capturedAtSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return new Date(parsed.data)
}

/**
 * RF3: `latitude`/`longitude` são um par — a metade sozinha é dado que mente, e é recusada. As duas
 * ausentes é o caso normal (o app sem permissão de localização, ou o aparelho sem sinal).
 */
function parsePosition(form: Awaited<ReturnType<Request['formData']>>): ProofPosition | undefined {
  const latitudeRaw = form.get(LATITUDE_FIELD)
  const longitudeRaw = form.get(LONGITUDE_FIELD)
  const hasLatitude = typeof latitudeRaw === 'string' && latitudeRaw.length > 0
  const hasLongitude = typeof longitudeRaw === 'string' && longitudeRaw.length > 0
  if (!hasLatitude && !hasLongitude) return undefined
  if (!hasLatitude || !hasLongitude) throw new ApiError(HTTP_ERROR.invalidRequest)

  const latitude = Number(latitudeRaw)
  const longitude = Number(longitudeRaw)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const accuracyMeters = parseAccuracyMeters(form.get(ACCURACY_METERS_FIELD))

  return {
    latitude: latitude.toFixed(7),
    longitude: longitude.toFixed(7),
    ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
  }
}

function parseAccuracyMeters(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined

  const accuracyMeters = Number(value)
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return accuracyMeters
}

/** Vazio é o caso de fábrica; presente, ele precisa ser CPF ou CNPJ na forma canônica. */
function parseReceiverDocument(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''

  const parsed = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (parsed === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}
