/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7d: qual e-mail consome a janela de AUTENTICADOS (20 em 5 minutos, a que fecha download e DKIM). Só o
 * que o encaminhador prova: a prévia aceita e a recusa depois de o remetente original passar na lista. O DKIM
 * `aligned` sozinho não prova nada — o `d=` pode ser do atacante, e uma mensagem assinada pelo encaminhador pode
 * ter sido só reenviada. O SQL do contador usa a mesma lista (`PREVIEW_EMAIL_UNPROVEN_REJECTIONS`).
 */
import {
  DKIM_ALIGNMENT_RESULT,
  type DkimAlignmentResult,
} from '../../contractor-mail/domain/dkim-alignment.policy.js'
import { PREVIEW_EMAIL_UNPROVEN_REJECTIONS } from './cargo-preview-email.constant.js'

const UNPROVEN_REJECTIONS: ReadonlySet<string> = new Set(PREVIEW_EMAIL_UNPROVEN_REJECTIONS)

export function countsAsAuthenticatedIntake(input: {
  readonly dkimResult: DkimAlignmentResult | undefined
  readonly reason: string | undefined
}): boolean {
  if (input.dkimResult !== DKIM_ALIGNMENT_RESULT.ALIGNED) return false
  return input.reason === undefined || !UNPROVEN_REJECTIONS.has(input.reason)
}
