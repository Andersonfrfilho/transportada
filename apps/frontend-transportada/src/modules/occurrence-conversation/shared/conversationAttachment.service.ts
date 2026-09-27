/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10): o anexo da conversa no painel e no app do motorista.
 *
 * - A lista de tipos e os tetos são **cópia por valor** da política da API
 *   (`conversation-attachment.policy.ts`); o contrato de paridade lê a de lá. A tela recusa antes de
 *   subir para o operador não esperar um upload que a API vai recusar — a conferência que vale
 *   continua sendo a da API, pelos bytes.
 * - O teto por tipo sai do `resolveMaxAttachmentSizeBytes` do `@adatechnology/conversations-ui`
 *   (função pura, sem Tailwind nem `styles.css`), com os tetos do app e do portal.
 * - Subir é pedir a URL à API e mandar o arquivo direto ao armazenamento, um de cada vez; se um
 *   falha, a mensagem não sai — nunca com anexo pela metade.
 */
import {
  resolveMaxAttachmentSizeBytes,
  type MaxAttachmentSizeBytes,
} from '@adatechnology/conversations-ui'

import { isRecord, isString } from './occurrenceConversationGuards.validation'

import type { OccurrenceConversationAttachment } from './occurrenceConversation.types'

const MB = 1024 * 1024

export type ConversationAttachmentKind = 'audio' | 'document' | 'image'

export const CONVERSATION_ATTACHMENT_CONTENT_TYPES: Readonly<
  Record<string, ConversationAttachmentKind>
> = {
  'application/pdf': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'audio/mp4': 'audio',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'text/csv': 'document',
}

/** Os canais que levam anexo; o WhatsApp espera o envio pela Meta (T002). */
export type ConversationAttachmentChannel = 'app' | 'email' | 'portal'

export const CONVERSATION_ATTACHMENT_LIMITS: Readonly<
  Record<ConversationAttachmentChannel, Readonly<Record<ConversationAttachmentKind, number>>>
> = {
  app: { audio: 16 * MB, document: 25 * MB, image: 10 * MB },
  email: { audio: 10 * MB, document: 10 * MB, image: 10 * MB },
  portal: { audio: 16 * MB, document: 25 * MB, image: 10 * MB },
}

export const CONVERSATION_ATTACHMENTS_PER_MESSAGE = 5

/** Spec 183 T702e: o total que um e-mail leva, somando os arquivos (a folga do Resend). */
export const CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES = 25 * MB

/** O `accept` do seletor de arquivo: os tipos e as extensões que o sistema operacional reconhece. */
export const CONVERSATION_ATTACHMENT_ACCEPT = [
  ...Object.keys(CONVERSATION_ATTACHMENT_CONTENT_TYPES),
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.xlsx',
  '.xls',
  '.csv',
].join(',')

export type ConversationAttachmentRejection =
  | Readonly<{ fileName: string; maxBytes: number; reason: 'size' | 'total' }>
  | Readonly<{ fileName: string; reason: 'limit' | 'type' }>

function limitsOf(channel: ConversationAttachmentChannel): MaxAttachmentSizeBytes {
  const limits = CONVERSATION_ATTACHMENT_LIMITS[channel]
  /** Vídeo não está na lista; o teto zero só existe porque o tipo do pacote pede o campo. */
  return { ...limits, video: 0 }
}

/** Soma os arquivos novos aos já escolhidos, recusando o que a API recusaria. */
export function pickConversationAttachments(input: {
  readonly channel: ConversationAttachmentChannel
  readonly current: readonly File[]
  readonly incoming: readonly File[]
}): Readonly<{ files: readonly File[]; rejected: readonly ConversationAttachmentRejection[] }> {
  const files = [...input.current]
  const rejected: ConversationAttachmentRejection[] = []
  const maxTotalBytes =
    input.channel === 'email' ? CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES : Infinity
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  for (const file of input.incoming) {
    if (CONVERSATION_ATTACHMENT_CONTENT_TYPES[file.type] === undefined) {
      rejected.push({ fileName: file.name, reason: 'type' })
      continue
    }
    const maxBytes = resolveMaxAttachmentSizeBytes(file.type, limitsOf(input.channel))
    if (file.size <= 0 || file.size > maxBytes) {
      rejected.push({ fileName: file.name, maxBytes, reason: 'size' })
      continue
    }
    if (files.length >= CONVERSATION_ATTACHMENTS_PER_MESSAGE) {
      rejected.push({ fileName: file.name, reason: 'limit' })
      continue
    }
    if (totalBytes + file.size > maxTotalBytes) {
      rejected.push({ fileName: file.name, maxBytes: maxTotalBytes, reason: 'total' })
      continue
    }
    totalBytes += file.size
    files.push(file)
  }
  return { files, rejected }
}

export type RequestConversationUpload = (input: {
  readonly contentType: string
  readonly fileName: string
  readonly sizeBytes: number
}) => Promise<Readonly<{ uploadId: string; uploadUrl: string }>>

export type PutConversationUpload = (input: {
  readonly file: File
  readonly url: string
}) => Promise<void>

/**
 * Sobe um por um, na ordem da escolha, e devolve os ids para o envio. `uploaded` guarda o que já
 * subiu neste rascunho: o reenvio depois de uma falha reusa os mesmos ids, e a chave de idempotência
 * da mensagem continua valendo (ids novos com a mesma chave seriam 409).
 */
export async function uploadConversationAttachments(input: {
  readonly files: readonly File[]
  readonly putFile: PutConversationUpload
  readonly requestUpload: RequestConversationUpload
  readonly uploaded?: Map<File, string>
}): Promise<readonly string[]> {
  const ids: string[] = []
  for (const file of input.files) {
    const known = input.uploaded?.get(file)
    if (known !== undefined) {
      ids.push(known)
      continue
    }
    const upload = await input.requestUpload({
      contentType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
    })
    await input.putFile({ file, url: upload.uploadUrl })
    input.uploaded?.set(file, upload.uploadId)
    ids.push(upload.uploadId)
  }
  return ids
}

/** Leitura tolerante: anexo que o guard não reconhece sai, a mensagem fica. */
export function toConversationAttachments(
  value: unknown,
): readonly OccurrenceConversationAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    isRecord(item) &&
    isString(item.contentType) &&
    isString(item.fileName) &&
    isString(item.id) &&
    typeof item.sizeBytes === 'number' &&
    isString(item.url)
      ? [
          {
            contentType: item.contentType,
            fileName: item.fileName,
            id: item.id,
            sizeBytes: item.sizeBytes,
            url: item.url,
          },
        ]
      : [],
  )
}

export function conversationAttachmentKind(contentType: string): ConversationAttachmentKind {
  return CONVERSATION_ATTACHMENT_CONTENT_TYPES[contentType] ?? 'document'
}

export type SendFailureRecovery = Readonly<{
  clearUploads: boolean
  reason: 'alreadySent' | 'driverChanged' | 'generic' | 'uploadExpired'
  renewKey: boolean
}>

function failureCode(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : ''
}

/**
 * Spec 183 T903 (F2/F3): o que o rascunho faz depois de um envio que falhou. Upload vencido
 * (`UPLOAD_INVALID`, a URL vale 15 min) sobe de novo; chave já usada com outro conteúdo — a API
 * gravou e a resposta se perdeu — ganha chave nova e sobe de novo. O resto repete o mesmo envio.
 */
export function recoverFromSendFailure(error: unknown): SendFailureRecovery {
  const code = failureCode(error)
  if (code === 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID') {
    return { clearUploads: true, reason: 'uploadExpired', renewKey: false }
  }
  if (code === 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED') {
    return { clearUploads: true, reason: 'alreadySent', renewKey: true }
  }
  /** T903 (C1): a conversa passou a outro motorista da viagem; reenviar não muda isso. */
  if (code === 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED') {
    return { clearUploads: false, reason: 'driverChanged', renewKey: false }
  }
  return { clearUploads: false, reason: 'generic', renewKey: false }
}

/**
 * Spec 183 T903 (F4): encaminhar usa a chave derivada do anexo. Chave já usada quer dizer que
 * alguém — outra pessoa, ou esta depois de recarregar — já encaminhou aquele anexo: é "já feito".
 */
export function isForwardAlreadyDone(error: unknown): boolean {
  return failureCode(error) === 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED'
}
