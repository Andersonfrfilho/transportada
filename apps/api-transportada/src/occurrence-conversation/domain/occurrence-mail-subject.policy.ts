/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §7, D7): o assunto do e-mail da ocorrência identifica a transportadora —
 * `<nome de exibição> · CNPJ <cnpj> — <assunto do modelo>`. O prefixo nunca é cortado nem aplicado duas vezes; só a
 * parte do modelo é cortada (a conta é de 200 menos o prefixo), e nunca fica abaixo de 40 caracteres. Pura.
 */
import { formatCnpjForDisplay } from '../../shared/tax-id.service.js'
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'
import { collapseLine, truncateText } from './occurrence-mail-text.policy.js'

const DISPLAY_NAME_MAX = 80
const MODEL_PART_MIN = 40
const CONTROL_REGEX = /[\p{Cc}\u{2028}\u{2029}]/gu
const LINE_WHITESPACE_REGEX = /[\t\n\r]/gu
const CONTROL_AND_FORMAT_REGEX = /[\p{Cc}\p{Cf}]/gu

/** Tab, LF e CR viram espaço (antes de colapsar); os demais controles e invisíveis (`Cc`, `Cf`) saem. */
export function cleanSubjectText(text: string): string {
  return collapseLine(
    text.replace(LINE_WHITESPACE_REGEX, ' ').replace(CONTROL_AND_FORMAT_REGEX, ''),
  )
}

export function applySubjectPrefix(params: {
  /** O CNPJ como gravado (sem pontuação). */
  readonly cnpj: string
  readonly companyDisplayName: string
  readonly subject: string
}): string {
  const fixed = ` · CNPJ ${formatCnpjForDisplay(params.cnpj)} — `
  const nameBudget = Math.min(
    DISPLAY_NAME_MAX,
    OCCURRENCE_MAIL_LIMITS.subject - MODEL_PART_MIN - fixed.length,
  )
  const name = truncateText(
    cleanSubjectText(params.companyDisplayName.replace(CONTROL_REGEX, ' ')),
    nameBudget,
  )
  const prefix = `${name}${fixed}`
  const subject = cleanSubjectText(params.subject)
  if (subject.startsWith(prefix)) return truncateText(subject, OCCURRENCE_MAIL_LIMITS.subject)
  return `${prefix}${truncateText(subject, OCCURRENCE_MAIL_LIMITS.subject - prefix.length)}`
}
