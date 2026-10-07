/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: lê o MIME do encaminhamento com PostalMime LIMITADO (profundidade e cabeçalhos) e abre
 * a mensagem anexada uma única vez, sem recursão — a de dentro nunca é aberta e nunca vira candidata.
 * Só sai o que a política do ramo precisa: o `From` de fora (o que o DKIM do encaminhador cobre), o
 * remetente original e os anexos candidatos. MIME ilegível devolve `undefined`; nunca estoura.
 */
import PostalMime, { type Attachment, type Email } from 'postal-mime'

import {
  PREVIEW_EMAIL_MIME_LIMITS,
  RFC822_MIME_TYPE,
} from '../domain/cargo-preview-email.constant.js'
import {
  readOriginalSenderFromForwardedText,
  readOriginalSenderFromHeaders,
  type OriginalSenderResult,
} from '../domain/forwarded-original-sender.policy.js'
import { readSingleMailboxAddress } from '../domain/mailbox-address.policy.js'
import type { CandidateAttachment } from '../domain/preview-email-attachment.policy.js'

export type ParsedForwardedEmail = {
  readonly attachments: readonly CandidateAttachment[]
  /** O `From` da mensagem de fora — o que o DKIM do encaminhador cobre. */
  readonly forwarderAddress: string | undefined
  readonly originalSender: OriginalSenderResult
}

const PARSE_OPTIONS = {
  attachmentEncoding: 'arraybuffer',
  forceRfc822Attachments: true,
  maxHeadersSize: PREVIEW_EMAIL_MIME_LIMITS.maxHeadersSize,
  maxNestingDepth: PREVIEW_EMAIL_MIME_LIMITS.maxNestingDepth,
} as const

export async function parseForwardedEmail(
  raw: Uint8Array,
): Promise<ParsedForwardedEmail | undefined> {
  const outer = await parseLimited(raw)
  if (outer === undefined) return undefined

  const forwardedMessages = outer.attachments.filter(isForwardedMessage)
  const ownAttachments = outer.attachments.filter((attachment) => !isForwardedMessage(attachment))
  const forwarderAddress = readForwarderAddress(outer)

  if (forwardedMessages.length > 1) {
    return {
      attachments: ownAttachments.map(toCandidate),
      forwarderAddress,
      originalSender: { kind: 'ambiguous' },
    }
  }
  const [forwarded] = forwardedMessages
  if (forwarded === undefined) {
    return {
      attachments: ownAttachments.map(toCandidate),
      forwarderAddress,
      originalSender: readOriginalSenderFromForwardedText(outer.text),
    }
  }

  const inner = await parseLimited(toBytes(forwarded.content))
  if (inner === undefined) return undefined
  return {
    attachments: [...inner.attachments, ...ownAttachments].map(toCandidate),
    forwarderAddress,
    originalSender: readOriginalSenderFromHeaders(inner.headers),
  }
}

async function parseLimited(raw: Uint8Array): Promise<Email | undefined> {
  try {
    return await PostalMime.parse(raw, PARSE_OPTIONS)
  } catch {
    return undefined
  }
}

/** Dois `From` na mensagem de fora não têm dono: quem encaminha não se adivinha. */
function readForwarderAddress(outer: Email): string | undefined {
  const fromHeaders = outer.headers.filter((header) => header.key === 'from')
  if (fromHeaders.length !== 1) return undefined
  return readSingleMailboxAddress(fromHeaders[0]?.value ?? '')
}

function isForwardedMessage(attachment: Attachment): boolean {
  return attachment.mimeType.split(';')[0]?.trim().toLowerCase() === RFC822_MIME_TYPE
}

function toCandidate(attachment: Attachment): CandidateAttachment {
  return {
    bytes: toBytes(attachment.content),
    disposition: attachment.disposition,
    fileName: attachment.filename,
    mimeType: attachment.mimeType,
  }
}

function toBytes(content: Attachment['content']): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}
