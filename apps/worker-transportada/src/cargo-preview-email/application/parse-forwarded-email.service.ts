/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OriginalSenderResult } from '../domain/forwarded-original-sender.policy.js'
import type { CandidateAttachment } from '../domain/preview-email-attachment.policy.js'

export type ParsedForwardedEmail = {
  readonly attachments: readonly CandidateAttachment[]
  /** O `From` da mensagem de fora — o que o DKIM do encaminhador cobre. */
  readonly forwarderAddress: string | undefined
  readonly originalSender: OriginalSenderResult
}

export async function parseForwardedEmail(
  raw: Uint8Array,
): Promise<ParsedForwardedEmail | undefined> {
  void raw
  return undefined
}
