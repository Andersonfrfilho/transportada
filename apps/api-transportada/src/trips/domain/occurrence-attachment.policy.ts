/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T2: a política pura da foto da ocorrência de galpão — teto de anexos, chaves de objeto
 * sem PII para original e miniatura, os dois tetos de bytes, a retenção de cinco anos e as
 * operações de idempotência da criação e do anexo adicional.
 */
import { createHash } from 'node:crypto'

import {
  DELIVERY_PROOF_MIME_TYPES,
  isDeliveryProofMimeType,
  matchesDeliveryProofSignature,
} from './delivery-proof.policy.js'
import { OccurrencePdfThumbnailError, TripDeliveryProofRejectedError } from './trip.error.js'

/**
 * Spec 161 D13. ⚠️ **Duplicado no banco**: o CHECK
 * `trip_document_occurrence_attachments_position_check` (T1,
 * `drizzle/20260921224341_trip_document_occurrence_attachments/migration.sql`) trava `position`
 * entre 1 e 5 do lado do Postgres. Mudar o teto aqui sem mudar o CHECK deixa os dois lados
 * discordando — a aplicação recusaria a sexta foto antes, mas o banco aceitaria uma sexta linha
 * gravada por outro caminho.
 */
export const OCCURRENCE_ATTACHMENT_LIMIT = 5

/**
 * Spec 161 RF3/D13: o original é a prova. 512 KiB é o teto do arquivo já reencodado pelo navegador
 * (T21) — acima disso a resposta é 422, nunca truncar ou recomprimir no servidor.
 */
export const OCCURRENCE_PHOTO_MAX_BYTES = 512 * 1024

/**
 * Spec 161 RF3/D13: a miniatura é cache do mesmo canvas do original, muito menor — 128 KiB é o
 * teto para o que as listas carregam em lote.
 */
export const OCCURRENCE_THUMBNAIL_MAX_BYTES = 128 * 1024

/**
 * Spec 161 RF3: cinco anos, para o original **e** para a miniatura — as duas expiram juntas. Uma
 * miniatura sobrevivendo ao original seria um retrato de carga alheia sem a prova a que pertence
 * (a miniatura é cache, nunca prova), e as duas vencem no mesmo ciclo do expurgo (T17).
 */
export const OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5

/**
 * `retention_until = created_at + 5 anos`, para o original e para a miniatura — a mesma data para
 * os dois, calculada uma vez a partir do momento em que o anexo nasce.
 */
export function resolveOccurrenceAttachmentRetentionUntil(createdAt: Date): Date {
  const retentionUntil = new Date(createdAt.getTime())
  retentionUntil.setUTCFullYear(
    retentionUntil.getUTCFullYear() + OCCURRENCE_ATTACHMENT_RETENTION_YEARS,
  )
  return retentionUntil
}

/**
 * A chave do objeto **não leva nome, CNPJ, número de nota nem qualquer identificador pessoal**
 * (§7 de segurança) — só identificadores opacos: empresa, ocorrência e o id do objeto. Quem lista o
 * bucket não aprende de quem é a caixa violada só pelo caminho.
 */
export function buildOccurrenceAttachmentObjectKey(input: {
  readonly companyId: string
  readonly occurrenceId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/trip-occurrence-attachments/${input.occurrenceId}/${input.objectId}`
}

/**
 * A miniatura mora ao lado do original, no mesmo espaço de chaves — sem PII, pelo mesmo motivo.
 */
export function buildOccurrenceThumbnailObjectKey(input: {
  readonly companyId: string
  readonly occurrenceId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/trip-occurrence-attachments/${input.occurrenceId}/thumbnails/${input.objectId}`
}

/** Spec 161: a criação da ocorrência de galpão com a(s) foto(s) — `withFieldReport`. */
export const OCCURRENCE_ATTACHMENT_CREATE_OPERATION = 'separation.document.occurrence'

/** Spec 161 RF6: a rota de anexo adicional a uma ocorrência já registrada. */
export const OCCURRENCE_ATTACHMENT_APPEND_OPERATION = 'separation.document.occurrence-attachment'

export type BuildOccurrenceAttachmentCreateFingerprintParams = {
  readonly attachmentSha256: string
  /**
   * I3 (revisão spec 161): sem a nota na impressão, a mesma foto com o mesmo tipo e a mesma
   * observação em **outra** nota convergia para a impressão da nota anterior — mesma foto e
   * mesmo texto não são incomuns entre notas de um mesmo galpão (produto padrão, observação
   * copiada). `documentId` já identifica a viagem por tabela (`trip_documents`), então não
   * precisa entrar sozinho na impressão.
   */
  readonly documentId: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode?: string | null
}

/**
 * A impressão digital de idempotência da **criação** leva o sha256 do original — nunca o da
 * miniatura, que é derivada e pode mudar de compressão sem mudar o fato registrado.
 */
export function buildOccurrenceAttachmentCreateFingerprint(
  params: BuildOccurrenceAttachmentCreateFingerprintParams,
): string {
  const fingerprint = JSON.stringify([
    params.documentId,
    params.occurrenceTypeId,
    params.note,
    params.productCode ?? null,
    params.attachmentSha256,
  ])
  return sha256(fingerprint)
}

export type BuildOccurrenceAttachmentAppendFingerprintParams = {
  readonly attachmentSha256: string
  readonly occurrenceId: string
}

/**
 * A impressão digital do **anexo adicional** leva a ocorrência e o sha256 do original — reenviar a
 * mesma foto para a mesma ocorrência converge; a mesma chave com outra foto é conteúdo diferente
 * (409 `TRIP_FIELD_REPORT_KEY_REUSED`), nunca uma sexta posição.
 */
export function buildOccurrenceAttachmentAppendFingerprint(
  params: BuildOccurrenceAttachmentAppendFingerprintParams,
): string {
  const fingerprint = JSON.stringify([params.occurrenceId, params.attachmentSha256])
  return sha256(fingerprint)
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * O anexo da ocorrência aceita **também PDF** — o conferente às vezes tem o laudo ou o romaneio já
 * digitalizado, e obrigá-lo a fotografar a tela seria trocar o documento pela foto dele. O canhoto
 * de entrega (`DELIVERY_PROOF_MIME_TYPES`) fica só com imagem, e esta lista é própria de propósito:
 * mexer numa nunca mexe na outra.
 */
export const OCCURRENCE_PDF_MIME_TYPE = 'application/pdf'

export const OCCURRENCE_ATTACHMENT_MIME_TYPES = [
  ...DELIVERY_PROOF_MIME_TYPES,
  OCCURRENCE_PDF_MIME_TYPE,
] as const

export type OccurrenceAttachmentMimeType = (typeof OCCURRENCE_ATTACHMENT_MIME_TYPES)[number]

/**
 * O teto do PDF é maior que o da foto porque não passa pelo reencode do navegador — mas tem de
 * caber inteiro no limite de corpo do servidor (`APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`, 1 MiB,
 * 413 antes da rota). 128 KiB de folga cobrem as fronteiras do multipart, a observação de 500
 * caracteres e os `productCodes` repetidos.
 */
export const OCCURRENCE_PDF_MAX_BYTES = 896 * 1024

export function isOccurrenceAttachmentMimeType(
  value: string,
): value is OccurrenceAttachmentMimeType {
  return (OCCURRENCE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value)
}

export function isOccurrencePdf(mimeType: string): boolean {
  return mimeType === OCCURRENCE_PDF_MIME_TYPE
}

/** `%PDF-` nos primeiros bytes — a assinatura real, não o `content-type` que o cliente declarou. */
const OCCURRENCE_PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const

function matchesOccurrenceAttachmentSignature(input: {
  readonly bytes: Uint8Array
  readonly mimeType: OccurrenceAttachmentMimeType
}): boolean {
  if (input.mimeType === OCCURRENCE_PDF_MIME_TYPE) {
    return OCCURRENCE_PDF_SIGNATURE.every((byte, index) => input.bytes[index] === byte)
  }
  return matchesDeliveryProofSignature({ bytes: input.bytes, mimeType: input.mimeType })
}

/**
 * Spec 161 T6 (RF7): teto, tipo e assinatura de bytes do original e da miniatura, num ponto só.
 * Chamado **antes** de qualquer transação ou upload: arquivo recusado não gasta reserva nem sobe ao
 * bucket (mesmo princípio de `office-delivery-proof.service.ts`).
 *
 * ⚠️ **PDF não tem miniatura** (RF29b/RF32b: a miniatura é cache, nunca prova). O caminho de
 * leitura já lida com `thumbnail: null`, então PDF sozinho é o caso normal — e PDF **com**
 * miniatura é recusado com código próprio, em vez de silenciosamente guardar um retrato de um
 * documento que ninguém vai reconhecer na lista.
 */
export function assertOccurrenceAttachmentAccepted(attachment: {
  readonly bytes: Uint8Array
  /** O teto da **imagem**; o PDF tem o seu, e escolher entre os dois é decisão desta função. */
  readonly imageMaxBytes: number
  readonly mimeType: string
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
}): void {
  assertOccurrenceFileAccepted({
    allowPdf: true,
    bytes: attachment.bytes,
    maxBytes: isOccurrencePdf(attachment.mimeType)
      ? OCCURRENCE_PDF_MAX_BYTES
      : attachment.imageMaxBytes,
    mimeType: attachment.mimeType,
  })

  if (attachment.thumbnail === undefined) return
  if (isOccurrencePdf(attachment.mimeType)) throw new OccurrencePdfThumbnailError()

  assertOccurrenceThumbnailAccepted(attachment.thumbnail)
}

/** A miniatura é sempre imagem: é ela que a lista carrega em lote, e PDF ali não renderiza. */
export function assertOccurrenceThumbnailAccepted(thumbnail: {
  readonly bytes: Uint8Array
  readonly mimeType: string
}): void {
  assertOccurrenceFileAccepted({
    allowPdf: false,
    bytes: thumbnail.bytes,
    maxBytes: OCCURRENCE_THUMBNAIL_MAX_BYTES,
    mimeType: thumbnail.mimeType,
  })
}

function assertOccurrenceFileAccepted(upload: {
  readonly allowPdf: boolean
  readonly bytes: Uint8Array
  readonly maxBytes: number
  readonly mimeType: string
}): void {
  if (upload.bytes.byteLength > upload.maxBytes) {
    throw new TripDeliveryProofRejectedError('TOO_LARGE')
  }
  const accepted = upload.allowPdf
    ? isOccurrenceAttachmentMimeType(upload.mimeType)
    : isDeliveryProofMimeType(upload.mimeType)
  if (!accepted) throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
  if (
    !matchesOccurrenceAttachmentSignature({
      bytes: upload.bytes,
      mimeType: upload.mimeType as OccurrenceAttachmentMimeType,
    })
  ) {
    throw new TripDeliveryProofRejectedError('UNSUPPORTED_TYPE')
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
