/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §3, D3): o renderer do e-mail HTML. Uma varredura só sobre o texto do **modelo**; o valor
 * é escapado, exceto as chaves do conjunto fechado, decididas pelo nome. O valor nunca é reinterpretado. Pura.
 */
import { interpolateEmailHtml } from '@adatechnology/notification-contracts'
import {
  OCCURRENCE_MAIL_HTML_MAX_BYTES,
  OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
  type OccurrenceMailSystemHtmlVariable,
} from './occurrence-contractor-mail.constant.js'
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'

/** O padrão do pacote de notificação (`extractTemplatePlaceholders`); o assunto segue por aqui. */
const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu
const WHITESPACE_RUN = /\s+/gu
const SYSTEM_HTML_NAMES: ReadonlySet<string> = new Set(OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES)

export type RenderContractorMailHtmlParams = {
  readonly bodyTemplate: string
  readonly subjectTemplate: string
  /** HTML pronto, montado só pela API (já escapa o que carrega); só as chaves do conjunto fechado valem. */
  readonly systemHtml: Readonly<Partial<Record<OccurrenceMailSystemHtmlVariable, string>>>
  /** Texto cru: é escapado na saída. */
  readonly values: Readonly<Record<string, string>>
}

export type RenderedContractorMailHtml = {
  readonly html: string
  readonly subject: string
  /** O HTML passa de `OCCURRENCE_MAIL_HTML_MAX_BYTES` bytes UTF-8: problema do modelo, não erro 500. */
  readonly tooLarge: boolean
}

function lookup(source: Readonly<Record<string, string>>, name: string): string {
  return Object.hasOwn(source, name) ? (source[name] ?? '') : ''
}

export function renderContractorMailHtml(
  params: RenderContractorMailHtmlParams,
): RenderedContractorMailHtml {
  const { bodyTemplate, subjectTemplate, systemHtml, values } = params
  const html = interpolateEmailHtml({
    systemHtml,
    systemHtmlNames: OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
    template: bodyTemplate,
    values,
  })
  const subject = subjectTemplate
    .replace(PLACEHOLDER_REGEX, (_match, name: string) =>
      SYSTEM_HTML_NAMES.has(name) ? '' : lookup(values, name),
    )
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, OCCURRENCE_MAIL_LIMITS.subject)
  return {
    html,
    subject,
    tooLarge: Buffer.byteLength(html, 'utf8') > OCCURRENCE_MAIL_HTML_MAX_BYTES,
  }
}
