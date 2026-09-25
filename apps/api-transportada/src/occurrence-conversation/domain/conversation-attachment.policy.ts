/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): a política pura do anexo da conversa da ocorrência.
 *
 * - Tipo fechado: PDF, imagem (JPEG, PNG, WEBP), planilha (XLSX, XLS, CSV) e o áudio da T705 (OGG,
 *   MP3, M4A, WEBM). SVG e HTML ficam de fora de propósito — os dois executam no navegador.
 * - Teto por canal e por tipo. Os do WhatsApp são os padrões do `@adatechnology/conversations-ui`
 *   (`DEFAULT_MAX_ATTACHMENT_SIZE_BYTES`, os limites da Meta); app e portal são nossos, e o e-mail
 *   fica abaixo do total que o Resend aceita por mensagem.
 * - O tipo que vale é o dos **bytes**: o `Content-Type` do upload não entra na assinatura da URL
 *   (mesma razão da spec 179), então a conferência é sobre o objeto já enviado.
 *
 * ⚠️ Cópia por valor no painel, no app, no portal (a tela recusa antes de subir) e no worker (o anexo
 * do e-mail recebido, spec 183 T702c1, onde a cópia é este arquivo inteiro); o contrato de paridade
 * de cada lado é o que segura as listas iguais.
 */
import type { OccurrenceConversationChannel } from '../../database/occurrence-conversation.schema.js'

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

export const CONVERSATION_ATTACHMENT_LIMITS: Readonly<
  Record<OccurrenceConversationChannel, Readonly<Record<ConversationAttachmentKind, number>>>
> = {
  app: { audio: 16 * MB, document: 25 * MB, image: 10 * MB },
  email: { audio: 10 * MB, document: 10 * MB, image: 10 * MB },
  portal: { audio: 16 * MB, document: 25 * MB, image: 10 * MB },
  whatsapp: { audio: 16 * MB, document: 100 * MB, image: 5 * MB },
}

/** Mais do que isso numa mensagem só é pasta, não anexo. */
export const CONVERSATION_ATTACHMENTS_PER_MESSAGE = 5

/**
 * Spec 183 T702e: o total de um e-mail, somando os arquivos. O Resend aceita 40 MB por mensagem
 * **depois** do base64 (que cresce um terço); 25 MB de bytes deixam folga para o corpo e cabeçalhos.
 */
export const CONVERSATION_EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES = 25 * MB

/** O nome aparece para quem baixa; o teto e a limpeza evitam caminho, byte nulo e tela quebrada. */
export const CONVERSATION_ATTACHMENT_FILE_NAME_MAX_LENGTH = 200

export function conversationAttachmentKind(contentType: string): ConversationAttachmentKind | null {
  return CONVERSATION_ATTACHMENT_CONTENT_TYPES[contentType] ?? null
}

/** O teto do tipo no canal; tipo fora da lista não tem teto (é recusado antes). */
export function maxConversationAttachmentBytes(
  channel: OccurrenceConversationChannel,
  contentType: string,
): number {
  const kind = conversationAttachmentKind(contentType)
  return kind === null ? 0 : CONVERSATION_ATTACHMENT_LIMITS[channel][kind]
}

export type DeclaredAttachmentCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'type' }
  | { readonly maxBytes: number; readonly ok: false; readonly reason: 'size' }

/** O que o cliente declarou, antes de subir: tipo da lista e tamanho entre 1 byte e o teto. */
export function checkDeclaredConversationAttachment(input: {
  readonly channel: OccurrenceConversationChannel
  readonly contentType: string
  readonly sizeBytes: number
}): DeclaredAttachmentCheck {
  if (conversationAttachmentKind(input.contentType) === null) return { ok: false, reason: 'type' }
  const maxBytes = maxConversationAttachmentBytes(input.channel, input.contentType)
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
    return { maxBytes, ok: false, reason: 'size' }
  }
  return { ok: true }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  return prefix.every((value, index) => bytes[offset + index] === value)
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

function includesAscii(bytes: Uint8Array, text: string, limit = 4096): boolean {
  const window = bytes.subarray(0, limit)
  let content = ''
  for (const byte of window) content += String.fromCharCode(byte)
  return content.includes(text)
}

/** Texto de verdade: UTF-8 válido e sem byte nulo nos primeiros 4 KiB. */
function looksLikeText(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, 4096)
  if (window.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(window)
    return true
  } catch {
    return false
  }
}

/** O tipo declarado bate com os bytes? A única conferência de tipo que vale (RF10). */
export function matchesConversationAttachmentSignature(
  contentType: string,
  bytes: Uint8Array,
): boolean {
  switch (contentType) {
    case 'application/pdf':
      return startsWith(bytes, ascii('%PDF-'))
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      /** XLSX é um ZIP; o que o distingue de outro ZIP (DOCX, qualquer um) é a pasta `xl/`. */
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && includesAscii(bytes, 'xl/', 64 * 1024)
    case 'application/vnd.ms-excel':
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'text/csv':
      return looksLikeText(bytes)
    case 'audio/ogg':
      return startsWith(bytes, ascii('OggS'))
    case 'audio/mpeg':
      return (
        startsWith(bytes, ascii('ID3')) || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
      )
    case 'audio/mp4':
      return startsWith(bytes, ascii('ftyp'), 4)
    case 'audio/webm':
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    default:
      return false
  }
}

/**
 * O nome como vai aparecer para quem baixa: só a última parte de um caminho, sem caractere de
 * controle, aparado e com teto. Vazio vira "anexo". Nunca vai a log (regra da spec).
 */
export function normalizeConversationAttachmentFileName(fileName: string): string {
  const lastSegment = fileName.split(/[/\\]/u).at(-1) ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = lastSegment.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  const name = clean === '' || clean === '.' || clean === '..' ? 'anexo' : clean
  return name.slice(0, CONVERSATION_ATTACHMENT_FILE_NAME_MAX_LENGTH)
}
