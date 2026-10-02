/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import {
  DRIVER_UPLOAD_PROOF_KINDS,
  type DriverUploadProofKind,
} from '../domain/delivery-event.constant.js'
import type { ProofPosition } from '../domain/delivery-proof-punctuality.policy.js'
import type { DeliveryProofUpload } from '../application/attach-delivery-proof.use-case.js'
import { normalizeReceivedBy } from './received-by.schema.js'

const FILE_FIELD = 'file'
const KIND_FIELD = 'kind'
/** Spec 220 RF17: a miniatura gerada no cliente — opcional; o teto de bytes é conferido pelo caso de uso. */
const THUMBNAIL_FIELD = 'thumbnail'
const RECEIVER_FIELD = 'receiverName'
/** Spec 193 D2: quem recebeu e o detalhe, lidos pela forma tolerante. */
const RECEIVED_BY_FIELD = 'receivedBy'
const RECEIVED_BY_DETAIL_FIELD = 'receivedByDetail'
/** ADR-0057 §3: o documento só entra quando a configuração da empresa pede — quem decide é o caso de uso. */
const RECEIVER_DOCUMENT_FIELD = 'receiverDocument'
/** Spec 082 (revisão, item 5): chave de idempotência opcional do anexo. */
const ATTACHMENT_KEY_FIELD = 'attachmentKey'
const ATTACHMENT_KEY_MAX_LENGTH = 128
const RECEIVER_NAME_MAX_LENGTH = 120
/** ADR-0070 §2-4, spec 159 RF3: onde e quando a foto foi tirada — os quatro campos são opcionais. */
const LATITUDE_FIELD = 'latitude'
const LONGITUDE_FIELD = 'longitude'
const ACCURACY_METERS_FIELD = 'accuracyMeters'
const CAPTURED_AT_FIELD = 'capturedAt'
/** Spec 205 RF3: o "Registrar entrega depois" — texto `true`/`false`, ausente ou vazio é `false`. */
const LATE_REGISTRATION_FIELD = 'lateRegistration'
/** Spec 232 D2: servidor − aparelho em ms, texto inteiro com sinal opcional. */
const CLOCK_OFFSET_FIELD = 'clockOffsetMs'

/**
 * Spec 159 T11 (itens 4 e 10): texto com teto e forma decimal **antes** de virar número — `Number()`
 * sozinho aceita `1e2`, `Infinity` e string de mil dígitos. A precisão declarada tem teto: acima de
 * 10 km o aparelho não sabe onde está, e o número só serviria para inflar o raio.
 */
const COORDINATE_TEXT_MAX_LENGTH = 24
const ACCURACY_TEXT_MAX_LENGTH = 24
const PROOF_ACCURACY_MAX_METERS = 10_000
/** Até 17 casas: é o que `String(number)` de um `double` do GPS do navegador produz. */
const SIGNED_DECIMAL_PATTERN = /^-?\d{1,3}(\.\d{1,17})?$/u
const UNSIGNED_DECIMAL_PATTERN = /^\d{1,5}(\.\d{1,17})?$/u

function decimalText(input: { readonly maxLength: number; readonly pattern: RegExp }) {
  return z.string().max(input.maxLength).regex(input.pattern).transform(Number)
}

/** Sem teto de desvio: relógio errado por anos é o que a correção conserta. 16 dígitos cobrem o inteiro seguro; o texto barra `1e99` antes do `Number()`. */
const CLOCK_OFFSET_TEXT_MAX_LENGTH = 17
const CLOCK_OFFSET_PATTERN = /^-?\d{1,16}$/u

const clockOffsetSchema = decimalText({
  maxLength: CLOCK_OFFSET_TEXT_MAX_LENGTH,
  pattern: CLOCK_OFFSET_PATTERN,
})
  .pipe(z.int())
  .optional()

const proofLocationSchema = z
  .object({
    accuracyMeters: decimalText({
      maxLength: ACCURACY_TEXT_MAX_LENGTH,
      pattern: UNSIGNED_DECIMAL_PATTERN,
    })
      .pipe(z.number().min(0).max(PROOF_ACCURACY_MAX_METERS))
      .optional(),
    capturedAt: z.iso.datetime().optional(),
    latitude: decimalText({
      maxLength: COORDINATE_TEXT_MAX_LENGTH,
      pattern: SIGNED_DECIMAL_PATTERN,
    })
      .pipe(z.number().min(-90).max(90))
      .optional(),
    longitude: decimalText({
      maxLength: COORDINATE_TEXT_MAX_LENGTH,
      pattern: SIGNED_DECIMAL_PATTERN,
    })
      .pipe(z.number().min(-180).max(180))
      .optional(),
  })
  /** RF3: meia coordenada é dado que mente — as duas juntas, ou nenhuma. */
  .refine((location) => (location.latitude === undefined) === (location.longitude === undefined))

type ProofLocation = {
  readonly capturedAt: Date | undefined
  readonly position: ProofPosition | undefined
}

/** Campo ausente ou vazio é "não veio" — o app sem permissão de localização é o caso normal. */
function readOptionalField(form: Awaited<ReturnType<Request['formData']>>, name: string): unknown {
  const value = form.get(name)
  return value === null || value === '' ? undefined : value
}

function parseProofLocation(form: Awaited<ReturnType<Request['formData']>>): ProofLocation {
  const parsed = proofLocationSchema.safeParse({
    accuracyMeters: readOptionalField(form, ACCURACY_METERS_FIELD),
    capturedAt: readOptionalField(form, CAPTURED_AT_FIELD),
    latitude: readOptionalField(form, LATITUDE_FIELD),
    longitude: readOptionalField(form, LONGITUDE_FIELD),
  })
  if (!parsed.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const { accuracyMeters, capturedAt, latitude, longitude } = parsed.data
  const position =
    latitude === undefined || longitude === undefined
      ? undefined
      : {
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7),
          ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
        }

  return { capturedAt: capturedAt === undefined ? undefined : new Date(capturedAt), position }
}

/** Ausente ou vazio é o cliente antigo; presente e inválido é `400`, nunca um desvio adivinhado. */
function parseClockOffset(form: Awaited<ReturnType<Request['formData']>>): number | undefined {
  const parsed = clockOffsetSchema.safeParse(readOptionalField(form, CLOCK_OFFSET_FIELD))
  if (!parsed.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed.data
}

function isProofKind(value: unknown): value is DriverUploadProofKind {
  return (
    typeof value === 'string' && (DRIVER_UPLOAD_PROOF_KINDS as readonly string[]).includes(value)
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

  const location = parseProofLocation(form)
  const thumbnail = await parseThumbnail(form)
  const clockOffsetMs = parseClockOffset(form)

  return {
    attachmentKey: typeof attachmentKey === 'string' ? attachmentKey : '',
    bytes: new Uint8Array(await file.arrayBuffer()),
    capturedAt: location.capturedAt,
    ...(clockOffsetMs === undefined ? {} : { clockOffsetMs }),
    kind,
    lateRegistration: parseLateRegistration(readOptionalField(form, LATE_REGISTRATION_FIELD)),
    mimeType: file.type,
    position: location.position,
    receiverDocument: parseReceiverDocument(form.get(RECEIVER_DOCUMENT_FIELD)),
    /** Spec 193 D2: a forma tolerante — o anexo do motorista nunca é recusado por quem recebeu. */
    receivedBy: normalizeReceivedBy({
      receivedBy: form.get(RECEIVED_BY_FIELD),
      receivedByDetail: form.get(RECEIVED_BY_DETAIL_FIELD),
    }),
    receiverName: typeof receiverName === 'string' ? receiverName : '',
    ...(thumbnail === undefined ? {} : { thumbnail }),
  }
}

/** Ausente ou vazio é o comprovante sem miniatura; texto no lugar do arquivo é `400`. */
async function parseThumbnail(
  form: Awaited<ReturnType<Request['formData']>>,
): Promise<DeliveryProofUpload['thumbnail']> {
  const value = readOptionalField(form, THUMBNAIL_FIELD)
  if (value === undefined) return undefined
  if (!(value instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)
  if (value.size === 0) return undefined

  return { bytes: new Uint8Array(await value.arrayBuffer()), mimeType: value.type }
}

/** O multipart só carrega texto: fora de `true`/`false` é `400`, nunca um booleano adivinhado. */
function parseLateRegistration(value: unknown): boolean {
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true

  throw new ApiError(HTTP_ERROR.invalidRequest)
}

/** Vazio é o caso de fábrica; presente, ele precisa ser CPF ou CNPJ na forma canônica. */
function parseReceiverDocument(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return ''

  const parsed = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (parsed === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}
