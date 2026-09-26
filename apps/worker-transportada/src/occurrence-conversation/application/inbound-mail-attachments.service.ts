/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c1 (RF10): os anexos do e-mail que a contratante responde, a partir do MIME que o
 * trilho da 143 já baixou e gravou.
 *
 * - O que entra é o que a API aceitaria pelo canal **e-mail**: tipo da lista, conferido pelos bytes
 *   (a política é cópia por valor da API, byte a byte), de 1 byte a 10 MB, no máximo cinco. Parte
 *   `inline` (o logo da assinatura) não é anexo.
 * - A chave do objeto é o token aleatório que a API usa — `occurrence-conversations/<token>` —, sem
 *   id interno, porque a leitura do portal assina a URL com ela.
 * - Recusa só conta. Nome de arquivo, tipo e tamanho nunca vão a log.
 * - MIME ilegível não derruba a resposta: vira "sem anexo". A evidência do e-mail é o MIME bruto,
 *   que já está gravado.
 */
import { createHash, randomBytes } from 'node:crypto'

import PostalMime from 'postal-mime'

import {
  CONVERSATION_ATTACHMENTS_PER_MESSAGE,
  conversationAttachmentKind,
  matchesConversationAttachmentSignature,
  maxConversationAttachmentBytes,
  normalizeConversationAttachmentFileName,
} from '../domain/conversation-attachment.policy.js'

export type InboundMailAttachment = {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly fileName: string
}

export type StoredInboundAttachment = {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly key: string
  readonly provider: string
  readonly sha256: string
  readonly sizeBytes: number
}

/** A porta que o trilho de e-mail usa: guardar os anexos antes da transação e descartá-los sem ela. */
export type InboundConversationAttachmentsPort = {
  discard(stored: readonly StoredInboundAttachment[]): Promise<void>
  store(
    raw: Uint8Array,
  ): Promise<{ readonly skipped: number; readonly stored: readonly StoredInboundAttachment[] }>
}

/** Alguns clientes de e-mail escrevem o tipo com variação; o que vale é a forma canônica da lista. */
function canonicalContentType(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return base === 'image/jpg' || base === 'image/pjpeg' ? 'image/jpeg' : base
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}

export async function extractInboundMailAttachments(
  raw: Uint8Array,
): Promise<{ readonly accepted: readonly InboundMailAttachment[]; readonly skipped: number }> {
  let parts: Awaited<ReturnType<typeof PostalMime.parse>>['attachments']
  try {
    parts = (await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' })).attachments
  } catch {
    return { accepted: [], skipped: 0 }
  }

  const accepted: InboundMailAttachment[] = []
  let skipped = 0
  for (const part of parts) {
    if (part.disposition === 'inline') continue
    const contentType = canonicalContentType(part.mimeType)
    const bytes = toBytes(part.content)
    const fits =
      conversationAttachmentKind(contentType) !== null &&
      bytes.byteLength > 0 &&
      bytes.byteLength <= maxConversationAttachmentBytes('email', contentType) &&
      matchesConversationAttachmentSignature(contentType, bytes)
    if (!fits || accepted.length >= CONVERSATION_ATTACHMENTS_PER_MESSAGE) {
      skipped += 1
      continue
    }
    accepted.push({
      bytes,
      contentType,
      fileName: normalizeConversationAttachmentFileName(part.filename ?? ''),
    })
  }
  return { accepted, skipped }
}

export function createInboundConversationAttachmentStore(dependencies: {
  readonly bucket: string
  /** Só para teste; em produção, 256 bits aleatórios (a mesma chave opaca da API). */
  readonly newToken?: () => string
  readonly provider: string
  readonly storage: {
    deleteObject(input: { readonly bucket: string; readonly key: string }): Promise<unknown>
    storeObject(input: {
      readonly body: Uint8Array
      readonly bucket: string
      readonly contentLength: number
      readonly contentType: string
      readonly key: string
      readonly sha256: string
    }): Promise<unknown>
  }
}): InboundConversationAttachmentsPort {
  const newToken = dependencies.newToken ?? (() => randomBytes(32).toString('base64url'))
  return {
    async discard(stored) {
      /** Melhor esforço: o objeto sem linha não aparece em tela nenhuma. */
      await Promise.allSettled(
        stored.map((item) =>
          dependencies.storage.deleteObject({ bucket: item.bucket, key: item.key }),
        ),
      )
    },
    async store(raw) {
      const extracted = await extractInboundMailAttachments(raw)
      const stored: StoredInboundAttachment[] = []
      for (const attachment of extracted.accepted) {
        const key = `occurrence-conversations/${newToken()}`
        const sha256 = createHash('sha256').update(attachment.bytes).digest('hex')
        await dependencies.storage.storeObject({
          body: attachment.bytes,
          bucket: dependencies.bucket,
          contentLength: attachment.bytes.byteLength,
          contentType: attachment.contentType,
          key,
          sha256,
        })
        stored.push({
          bucket: dependencies.bucket,
          contentType: attachment.contentType,
          fileName: attachment.fileName,
          key,
          provider: dependencies.provider,
          sha256,
          sizeBytes: attachment.bytes.byteLength,
        })
      }
      return { skipped: extracted.skipped, stored }
    },
  }
}
