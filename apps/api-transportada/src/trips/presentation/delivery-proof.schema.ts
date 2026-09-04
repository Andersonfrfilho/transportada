/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TRIP_DELIVERY_PROOF_KINDS,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
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
    kind,
    mimeType: file.type,
    receiverDocument: parseReceiverDocument(form.get(RECEIVER_DOCUMENT_FIELD)),
    receiverName: typeof receiverName === 'string' ? receiverName : '',
  }
}

/** Vazio é o caso de fábrica; presente, ele precisa ser CPF ou CNPJ na forma canônica. */
function parseReceiverDocument(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''

  const parsed = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (parsed === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}
