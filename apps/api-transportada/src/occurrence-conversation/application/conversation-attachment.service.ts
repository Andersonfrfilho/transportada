/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o anexo da conversa em três passos.
 *
 * 1. **Pedido** (`requestConversationUpload`): confere o que o cliente declarou (tipo, teto do
 *    canal), grava o pedido e devolve a URL assinada de vida curta. A chave do objeto não leva nome,
 *    CNPJ, nota nem id interno — só um token aleatório. O arquivo nunca passa pela API.
 * 2. **Ligação** (`attachConversationUploads`), dentro da transação da mensagem: cada pedido tem de
 *    ser deste alvo e estar `pending` e no prazo; o objeto tem de existir, caber no teto e ter os
 *    bytes do tipo declarado. Só então vira `stored_objects` + anexo da mensagem, com o sha256 dos
 *    bytes. Qualquer falha desfaz a mensagem inteira — mensagem com anexo pela metade não existe.
 * 3. **Leitura** (`signConversationAttachments`): URL temporária de cinco minutos, para baixar com o
 *    nome do arquivo.
 */
import { createHash, randomBytes } from 'node:crypto'

import {
  checkDeclaredConversationAttachment,
  CONVERSATION_ATTACHMENTS_PER_MESSAGE,
  matchesConversationAttachmentSignature,
  maxConversationAttachmentBytes,
  normalizeConversationAttachmentFileName,
} from '../domain/conversation-attachment.policy.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import {
  OccurrenceConversationAttachmentRejectedError,
  OccurrenceConversationMessageInvalidError,
  OccurrenceConversationUploadInvalidError,
} from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentStoragePort,
  ConversationAttachmentTransactionPort,
  ConversationAttachmentView,
  ConversationUploadRepositoryPort,
  ConversationUploadTarget,
} from './conversation-attachment.port.js'

/** Quinze minutos para subir, como o pedido da spec 179 — vida curta de propósito. */
export const CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS = 900

/** A URL de leitura vale cinco minutos, como a da foto da ocorrência (spec 161). */
export const CONVERSATION_ATTACHMENT_DOWNLOAD_SECONDS = 300

/**
 * A chave do objeto é só um token aleatório. Diferente das outras chaves da base
 * (`tenants/<empresa>/…`), esta vai dentro da URL assinada que o portal da contratante recebe, e
 * o portal não vê id interno — nem da empresa, nem da ocorrência, nem do pedido. O isolamento
 * nunca dependeu do prefixo: a URL só é assinada depois da consulta pela empresa do contexto.
 */
export function buildConversationUploadObjectKey(token: string): string {
  return `occurrence-conversations/${token}`
}

function newConversationObjectToken(): string {
  return randomBytes(32).toString('base64url')
}

export type RequestConversationUploadResult = {
  readonly expiresAt: string
  readonly uploadId: string
  readonly uploadUrl: string
}

export async function requestConversationUpload(input: {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly newId: () => string
  /** Só para teste; em produção, 256 bits aleatórios. */
  readonly newObjectToken?: () => string
  readonly now: Date
  readonly repository: ConversationUploadRepositoryPort
  readonly sizeBytes: number
  readonly storage: ConversationAttachmentStoragePort
  readonly target: ConversationUploadTarget
}): Promise<RequestConversationUploadResult> {
  const declared = checkDeclaredConversationAttachment({
    channel: input.target.channel,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  })
  if (!declared.ok) {
    throw new OccurrenceConversationAttachmentRejectedError(
      declared.reason === 'size'
        ? { maxBytes: declared.maxBytes, reason: 'size' }
        : { reason: 'type' },
    )
  }

  const id = input.newId()
  const objectKey = buildConversationUploadObjectKey(
    (input.newObjectToken ?? newConversationObjectToken)(),
  )
  const expiresAt = new Date(input.now.getTime() + CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS * 1000)
  await input.repository.insertUpload({
    ...input.target,
    bucket: input.bucket,
    declaredContentType: input.contentType,
    declaredSizeBytes: input.sizeBytes,
    expiresAt,
    fileName: normalizeConversationAttachmentFileName(input.fileName),
    id,
    objectKey,
  })
  const uploadUrl = await input.storage.createSignedUpload({
    bucket: input.bucket,
    contentLength: input.sizeBytes,
    contentType: input.contentType,
    expiresInSeconds: CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS,
    key: objectKey,
  })
  return { expiresAt: expiresAt.toISOString(), uploadId: id, uploadUrl: uploadUrl.toString() }
}

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function attachConversationUploads(input: {
  readonly messageId: string
  readonly now: Date
  readonly storage: ConversationAttachmentStoragePort
  readonly target: ConversationUploadTarget
  readonly transaction: ConversationAttachmentTransactionPort
  readonly uploadIds: readonly string[]
}): Promise<void> {
  if (input.uploadIds.length === 0) return
  const unique = new Set(input.uploadIds)
  if (
    unique.size !== input.uploadIds.length ||
    unique.size > CONVERSATION_ATTACHMENTS_PER_MESSAGE
  ) {
    throw new OccurrenceConversationUploadInvalidError()
  }

  const pending = await input.transaction.lockPendingUploads({
    ids: [...unique],
    target: input.target,
  })
  if (pending.length !== unique.size) throw new OccurrenceConversationUploadInvalidError()

  for (const upload of input.uploadIds.flatMap((id) => pending.filter((row) => row.id === id))) {
    if (upload.expiresAt.getTime() <= input.now.getTime()) {
      throw new OccurrenceConversationUploadInvalidError()
    }
    const location = { bucket: upload.bucket, key: upload.objectKey }
    const head = await input.storage.headObject(location)
    if (head === undefined) throw new OccurrenceConversationUploadInvalidError()

    const maxBytes = maxConversationAttachmentBytes(
      input.target.channel,
      upload.declaredContentType,
    )
    /** O tamanho vem do `head()`: acima do teto, o objeto nem é baixado. */
    if (head.contentLength <= 0 || head.contentLength > maxBytes) {
      throw new OccurrenceConversationAttachmentRejectedError({ maxBytes, reason: 'size' })
    }
    const bytes = await readAllBytes(await input.storage.getObjectStream(location))
    if (
      bytes.byteLength > maxBytes ||
      !matchesConversationAttachmentSignature(upload.declaredContentType, bytes)
    ) {
      throw new OccurrenceConversationAttachmentRejectedError(
        bytes.byteLength > maxBytes ? { maxBytes, reason: 'size' } : { reason: 'type' },
      )
    }

    await input.transaction.attachUpload({
      bucket: upload.bucket,
      companyId: input.target.companyId,
      contentType: upload.declaredContentType,
      fileName: upload.fileName,
      messageId: input.messageId,
      now: input.now,
      objectKey: upload.objectKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      uploadId: upload.id,
    })
  }
}

/** Os anexos por mensagem, cada um com a URL temporária de leitura. */
export async function signConversationAttachments(
  storage: Pick<ConversationAttachmentStoragePort, 'createSignedDownload'>,
  records: readonly ConversationAttachmentRecord[],
): Promise<ReadonlyMap<string, readonly ConversationAttachmentView[]>> {
  const byMessage = new Map<string, ConversationAttachmentView[]>()
  for (const record of records) {
    const url = await storage.createSignedDownload({
      bucket: record.bucket,
      disposition: 'attachment',
      expiresInSeconds: CONVERSATION_ATTACHMENT_DOWNLOAD_SECONDS,
      filename: record.fileName,
      key: record.objectKey,
    })
    const views = byMessage.get(record.messageId) ?? []
    views.push({
      contentType: record.contentType,
      fileName: record.fileName,
      id: record.id,
      sizeBytes: record.sizeBytes,
      url: url.toString(),
    })
    byMessage.set(record.messageId, views)
  }
  return byMessage
}

/**
 * O texto da mensagem com anexo (RF10): aparado, até 8.000 caracteres, e pode ficar vazio **só**
 * quando a mensagem leva anexo — foto sem legenda é o caso comum. Vazio dos dois é 422.
 */
export function normalizeConversationMessageBody(
  bodyText: string,
  attachmentIds: readonly string[],
): string {
  const body = bodyText.trim()
  if (body.length > OCCURRENCE_MAIL_LIMITS.body || (body === '' && attachmentIds.length === 0)) {
    throw new OccurrenceConversationMessageInvalidError()
  }
  return body
}
