/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { COMPANY_USER_JOB_TITLE_MAX_LENGTH } from './company-user-job-title.constant.js'

export type CompanyUserJobTitleResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly reason: 'too_long' }

/** Quebras de linha e tabulação viram espaço antes de sair o resto: `a\nb` é dois nomes, não `ab`. */
const LINE_BREAK_OR_TAB_PATTERN = /[\t\n\v\f\r\u2028\u2029]/gu
/** Controle e marcas bidi (que reordenam a frase na tela) não têm lugar num cargo. */
const CONTROL_OR_BIDI_PATTERN = /[\p{Cc}‪-‮⁦-⁩]/gu
const WHITESPACE_RUN_PATTERN = /\s+/gu

export function normalizeCompanyUserJobTitle(
  value: string | null | undefined,
): CompanyUserJobTitleResult {
  if (value === null || value === undefined) return { ok: true, value: null }
  const sanitized = value
    .replace(LINE_BREAK_OR_TAB_PATTERN, ' ')
    .replace(CONTROL_OR_BIDI_PATTERN, '')
    .replace(WHITESPACE_RUN_PATTERN, ' ')
    .trim()
  if (sanitized.length === 0) return { ok: true, value: null }
  if ([...sanitized].length > COMPANY_USER_JOB_TITLE_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' }
  }
  return { ok: true, value: sanitized }
}
