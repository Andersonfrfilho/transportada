/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §3, §4, §12; D12): a composição do e-mail HTML do modelo. Monta os valores (nota, identidade da
 * transportadora, assinante), renderiza numa passada, acha a área de mensagem e devolve o texto dela com o corte de
 * `linhasItens` do caminho de texto. Com texto do operador **editado**, a área vira o texto dele, escapado em
 * parágrafos, inserido **depois** da renderização — nunca passa pelo renderer. Pura.
 *
 * Modelo sem a área, ou HTML acima do teto do CHECK, é problema do modelo: `OccurrenceMailTemplateMissingError`
 * (409), nunca 500.
 */
import { escapeMailHtml } from '../../contractor-mail/domain/mail-template-render.policy.js'
import { joinItemLines } from '../../trips/domain/occurrence-mail-values.policy.js'
import type {
  CarrierIdentity,
  OccurrenceMailHtmlSource,
} from '../application/occurrence-mail.port.js'
import {
  OCCURRENCE_ITEM_LINES_LIMIT,
  OCCURRENCE_MAIL_HTML_MAX_BYTES,
} from './occurrence-contractor-mail.constant.js'
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'
import { OccurrenceMailTemplateMissingError } from './occurrence-conversation.error.js'
import { buildOccurrenceMailIdentityValues } from './occurrence-mail-carrier-values.policy.js'
import { OCCURRENCE_MAIL_COLORS, OCCURRENCE_MAIL_FONT } from './occurrence-mail-html.constant.js'
import { renderContractorMailHtml } from './occurrence-mail-html-render.policy.js'
import { findMessageArea } from './occurrence-mail-html-safety.policy.js'
import { htmlToPlainText } from './occurrence-mail-plain-text.policy.js'
import { buildSignerValues, type OccurrenceMailSigner } from './occurrence-mail-signer.policy.js'
import { buildOccurrenceMailSystemHtml } from './occurrence-mail-system-html.policy.js'
import { truncateText } from './occurrence-mail-text.policy.js'

const LINES_PLACEHOLDER_REGEX = /\{\{\s*linhasItens\s*\}\}/u
const LOGO_PLACEHOLDER_REGEX = /\{\{\s*logoTransportadora\s*\}\}/u
const PARAGRAPH_STYLE = `margin:0 0 12px;font-family:${OCCURRENCE_MAIL_FONT};font-size:14px;line-height:1.5;color:${OCCURRENCE_MAIL_COLORS.ink}`

export type ComposedOccurrenceMailHtml = {
  /** O texto da área de mensagem como o modelo a gera (com o corte de `linhasItens`), ≤ 8000. */
  readonly areaText: string
  /** O modelo usa `{{logoTransportadora}}` **e** há logo: o e-mail leva a parte inline. */
  readonly hasInlineLogo: boolean
  readonly html: string
  /** O assunto do modelo preenchido, sem o prefixo da transportadora. */
  readonly subject: string
}

/** Fim de linha e pontas, para comparar o texto devolvido pelo diálogo com o gerado. */
function normalizeText(text: string): string {
  return text.replaceAll('\r\n', '\n').trim()
}

function toParagraphs(text: string): string {
  return normalizeText(text)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map(
      (paragraph) =>
        `<p style="${PARAGRAPH_STYLE}">${escapeMailHtml(paragraph).replaceAll('\n', '<br>')}</p>`,
    )
    .join('\n')
}

/**
 * Quantas linhas de `linhasItens` a área comporta: o texto dela tem de caber no teto da conversa. Só a área é
 * renderizada aqui (a chave de HTML do sistema não pode estar nela), e só quando ela usa `linhasItens`.
 */
function resolveShownLines(params: {
  readonly areaTemplate: string
  readonly source: OccurrenceMailHtmlSource
  readonly values: Readonly<Record<string, string>>
}): number {
  const { areaTemplate, source, values } = params
  let shown = Math.min(source.itemLines.length, OCCURRENCE_ITEM_LINES_LIMIT)
  if (!LINES_PLACEHOLDER_REGEX.test(areaTemplate)) return shown
  const areaTextWith = (lines: number): string =>
    htmlToPlainText(
      renderContractorMailHtml({
        bodyTemplate: areaTemplate,
        subjectTemplate: '',
        systemHtml: {},
        values: { ...values, linhasItens: joinItemLines(source.itemLines, lines) },
      }).html,
    )
  while (shown > 0 && areaTextWith(shown).length > OCCURRENCE_MAIL_LIMITS.body) shown -= 1
  return shown
}

function assertWithinLimit(html: string): void {
  if (Buffer.byteLength(html, 'utf8') > OCCURRENCE_MAIL_HTML_MAX_BYTES) {
    throw new OccurrenceMailTemplateMissingError()
  }
}

export function composeOccurrenceMailHtml(params: {
  readonly appBaseUrl: string | undefined
  /** `undefined` sem perfil fiscal: a identidade sai vazia e sem logo. */
  readonly carrier: CarrierIdentity | undefined
  readonly contractorTaxId: null | string
  /** A mensagem sai com `Reply-To` (Resend): só então a faixa de resposta aparece. */
  readonly hasReplyTo: boolean
  /** O texto que o diálogo devolveu; ausente (ou igual ao gerado), a área do modelo fica como está. */
  readonly operatorText?: string
  readonly signer: OccurrenceMailSigner
  readonly source: OccurrenceMailHtmlSource
}): ComposedOccurrenceMailHtml {
  const { carrier, source } = params
  const area = findMessageArea(source.bodyTemplate)
  if (area === undefined) throw new OccurrenceMailTemplateMissingError()

  const displayName = carrier?.displayName ?? ''
  const identity =
    carrier === undefined
      ? {}
      : buildOccurrenceMailIdentityValues({ carrier, contractorTaxId: params.contractorTaxId })
  const values = {
    ...source.values,
    ...identity,
    ...buildSignerValues({ companyDisplayName: displayName, signer: params.signer }),
  }
  const areaTemplate = source.bodyTemplate.slice(area.contentStart, area.contentEnd)
  const shown = resolveShownLines({ areaTemplate, source, values })
  const { hasInlineLogo, systemHtml } = buildOccurrenceMailSystemHtml({
    appBaseUrl: params.appBaseUrl,
    displayName,
    hasLogo: carrier?.hasLogo ?? false,
    hasReplyTo: params.hasReplyTo,
    itemRows: source.itemRows,
    itemsSum: source.itemsSum,
  })
  const rendered = renderContractorMailHtml({
    bodyTemplate: source.bodyTemplate,
    subjectTemplate: source.subjectTemplate,
    systemHtml,
    values: { ...values, linhasItens: joinItemLines(source.itemLines, shown) },
  })
  if (rendered.tooLarge) throw new OccurrenceMailTemplateMissingError()

  const renderedArea = findMessageArea(rendered.html)
  if (renderedArea === undefined) throw new OccurrenceMailTemplateMissingError()
  const areaText = truncateText(
    htmlToPlainText(rendered.html.slice(renderedArea.contentStart, renderedArea.contentEnd)),
    OCCURRENCE_MAIL_LIMITS.body,
  )

  const edited =
    params.operatorText !== undefined &&
    normalizeText(params.operatorText) !== normalizeText(areaText)
  const html = edited
    ? `${rendered.html.slice(0, renderedArea.contentStart)}\n${toParagraphs(params.operatorText ?? '')}\n${rendered.html.slice(renderedArea.contentEnd)}`
    : rendered.html
  assertWithinLimit(html)
  return {
    areaText,
    hasInlineLogo: hasInlineLogo && LOGO_PLACEHOLDER_REGEX.test(source.bodyTemplate),
    html,
    subject: rendered.subject,
  }
}
