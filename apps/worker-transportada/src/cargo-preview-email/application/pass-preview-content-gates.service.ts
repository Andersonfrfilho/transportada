/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: depois do DKIM do encaminhador — o `From` do MIME, o remetente original e o anexo, todos
 * lidos do que o DKIM cobre. O DKIM do contratante se perde no encaminhamento: o remetente original é
 * informação, nunca autenticação.
 */
import type { DkimAlignmentResult } from '../../contractor-mail/domain/dkim-alignment.policy.js'
import { PREVIEW_EMAIL_REJECTION } from '../domain/cargo-preview-email.constant.js'
import { selectPreviewWorkbook } from '../domain/preview-email-attachment.policy.js'
import {
  isForwarderAllowed,
  isOriginalSenderAllowed,
} from '../domain/preview-sender-allowlist.policy.js'
import type {
  CargoPreviewEmailIntakeResult,
  PreviewProfileRecord,
  VerifiedPreviewEmail,
} from './cargo-preview-email.types.js'
import type { PreviewEmailRejecter } from './create-preview-email-rejecter.service.js'
import { parseForwardedEmail } from './parse-forwarded-email.service.js'

export type PreviewContentGate =
  | { readonly kind: 'passed'; readonly verified: VerifiedPreviewEmail }
  | CargoPreviewEmailIntakeResult

export async function passPreviewContentGates(context: {
  readonly dkimResult: DkimAlignmentResult
  readonly profile: PreviewProfileRecord
  readonly raw: Buffer
  readonly reject: PreviewEmailRejecter
}): Promise<PreviewContentGate> {
  const { dkimResult, profile, raw, reject } = context
  const parsed = await parseForwardedEmail(raw)
  const withDkim = { dkimResult }
  if (parsed?.forwarderAddress === undefined) {
    return reject(PREVIEW_EMAIL_REJECTION.mimeUnreadable, withDkim)
  }
  if (
    !isForwarderAllowed({ address: parsed.forwarderAddress, allowlist: profile.forwarderAllowlist })
  ) {
    return reject(PREVIEW_EMAIL_REJECTION.forwarderNotAllowed, withDkim)
  }

  const original = parsed.originalSender
  if (original.kind === 'missing') {
    return reject(PREVIEW_EMAIL_REJECTION.originalSenderMissing, withDkim)
  }
  if (original.kind === 'ambiguous') {
    return reject(PREVIEW_EMAIL_REJECTION.originalSenderAmbiguous, withDkim)
  }
  const read = { dkimResult, isOriginalSenderRead: true }
  if (!isOriginalSenderAllowed({ address: original.address, allowlist: profile.senderAllowlist })) {
    return reject(PREVIEW_EMAIL_REJECTION.originalSenderNotAllowed, read)
  }

  const workbook = selectPreviewWorkbook(parsed.attachments)
  if (workbook.kind === 'rejected') return reject(workbook.code, read)
  return { kind: 'passed', verified: { dkimResult, file: workbook, raw } }
}
