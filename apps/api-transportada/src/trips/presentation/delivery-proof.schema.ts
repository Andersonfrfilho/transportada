/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TRIP_DELIVERY_PROOF_KINDS,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type { DeliveryProofUpload } from '../application/attach-delivery-proof.use-case.js'

const FILE_FIELD = 'file'
const KIND_FIELD = 'kind'
const RECEIVER_FIELD = 'receiverName'
const RECEIVER_NAME_MAX_LENGTH = 120

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

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    kind,
    mimeType: file.type,
    receiverName: typeof receiverName === 'string' ? receiverName : '',
  }
}
