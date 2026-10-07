/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7c (segunda revisão de segurança, NOVO-2): as partes do MIME da conversa, lidas com PostalMime
 * LIMITADO. Uma `message/rfc822` aninhada era aberta recursivamente pelo próprio PostalMime e o `addressparser`
 * rodava no `To`/`Cc` dela (256 KiB de `To` aninhado = 40 s de laço travado). Agora o PostalMime não abre a
 * aninhada (`forceRfc822Attachments`) e quem a abre somos nós: só depois da MESMA barreira de cabeçalho do MIME
 * de fora e até três níveis. O resultado visível é o de antes — os anexos de dentro entram na mesma posição —;
 * a aninhada hostil ou funda demais conta como uma recusa e o resto da mensagem segue lido.
 */
import PostalMime from 'postal-mime'

import { MIME_HEADER_LIMITS } from '../../contractor-mail/domain/contractor-mail.constant.js'
import { hasBoundedMimeHeaders } from '../../contractor-mail/domain/mime-header-bounds.policy.js'

const MAX_NESTED_MESSAGE_DEPTH = 3
const NESTED_MESSAGE_MIME_TYPE = 'message/rfc822'
const POSTAL_MIME_OPTIONS = {
  attachmentEncoding: 'arraybuffer',
  forceRfc822Attachments: true,
  maxHeadersSize: MIME_HEADER_LIMITS.maxSectionBytes,
  maxNestingDepth: 6,
} as const

export type InboundMailPart = Awaited<ReturnType<typeof PostalMime.parse>>['attachments'][number]

export type InboundMailParts = {
  readonly parts: readonly InboundMailPart[]
  /** Mensagens aninhadas que não foram abertas (cabeçalho fora do limite, fundas demais ou ilegíveis). */
  readonly skippedNestedMessages: number
}

/** MIME ilegível lança: quem chama decide o que fazer sem a mensagem. */
export async function readInboundMailParts(raw: Uint8Array): Promise<InboundMailParts> {
  return flattenParts(raw, 0)
}

async function flattenParts(raw: Uint8Array, depth: number): Promise<InboundMailParts> {
  const { attachments } = await PostalMime.parse(raw, POSTAL_MIME_OPTIONS)
  const parts: InboundMailPart[] = []
  let skippedNestedMessages = 0
  for (const part of attachments) {
    if (!isInlineNestedMessage(part)) {
      parts.push(part)
      continue
    }
    const nested = await readNestedMessage(part, depth + 1)
    if (nested === undefined) {
      skippedNestedMessages += 1
      continue
    }
    parts.push(...nested.parts)
    skippedNestedMessages += nested.skippedNestedMessages
  }
  return { parts, skippedNestedMessages }
}

/** O mesmo critério do PostalMime: `message/rfc822` sem disposição ou `inline` era aberta no lugar. */
function isInlineNestedMessage(part: InboundMailPart): boolean {
  return part.mimeType === NESTED_MESSAGE_MIME_TYPE && (part.disposition ?? 'inline') === 'inline'
}

async function readNestedMessage(
  part: InboundMailPart,
  depth: number,
): Promise<InboundMailParts | undefined> {
  const bytes = toBytes(part.content)
  if (depth > MAX_NESTED_MESSAGE_DEPTH || !hasBoundedMimeHeaders(bytes)) return undefined
  try {
    return await flattenParts(bytes, depth)
  } catch {
    return undefined
  }
}

function toBytes(content: InboundMailPart['content']): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}
