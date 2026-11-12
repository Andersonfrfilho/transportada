/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { htmlToPlainText, interpolateEmailHtml } from '@adatechnology/notification-contracts'

import { escapeMailHtml as escapeHtml } from '../../contractor-mail/domain/mail-template-render.policy.js'
import {
  ADDRESS_CORRECTION_MAIL_COLOR,
  ADDRESS_CORRECTION_MAIL_FONT_FAMILY,
} from './address-correction-mail.constant.js'
import {
  ADDRESS_CORRECTION_MAIL_SUBJECT_MAX_LENGTH,
  ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES,
} from './address-correction-mail-template.constant.js'
import {
  formatAddress,
  formatReason,
  itemHeading,
} from './address-correction-mail-format.policy.js'
import type {
  AddressCorrectionMailItem,
  BuildAddressCorrectionMailParams,
  BuildAddressCorrectionMailResult,
} from './address-correction-mail.types.js'

/** O padrão do pacote de notificação (`extractTemplatePlaceholders`); o assunto segue por aqui. */
const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu
const WHITESPACE_RUN = /\s+/gu
const SYSTEM_HTML_NAMES: ReadonlySet<string> = new Set(
  ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES,
)

/**
 * Função pura (spec 286, RF6): o layout e o texto vêm do modelo `correcao-endereco.padrao` do módulo de
 * notificação (ADR-0110: layout de e-mail não mora em código). A API monta só o que o modelo não sabe — as
 * variáveis de texto, que são escapadas, e o HTML do sistema `{{blocosEnderecos}}`, um bloco numerado por
 * endereço (nome, como veio na nota, endereço correto e motivo).
 */
export function buildAddressCorrectionMail(
  params: BuildAddressCorrectionMailParams,
): BuildAddressCorrectionMailResult {
  const { carrierName, contractorName, items, operatorName, template } = params
  const count = items.length
  const values: Readonly<Record<string, string>> = {
    clientes: `${count} ${pluralize(count, 'cliente', 'clientes')}`,
    contratante: contractorName,
    operador: operatorName,
    quantidade: String(count),
    transportadora: carrierName,
  }

  const html = interpolateEmailHtml({
    systemHtml: { blocosEnderecos: items.map(buildHtmlBlock).join('') },
    systemHtmlNames: ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES,
    template: template.body,
    values,
  })
  /** Assunto vira cabeçalho: nenhuma quebra de linha vinda de valor sobrevive. */
  const subject = template.subject
    .replace(PLACEHOLDER_REGEX, (_match, name: string) =>
      SYSTEM_HTML_NAMES.has(name) || !Object.hasOwn(values, name) ? '' : (values[name] ?? ''),
    )
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, ADDRESS_CORRECTION_MAIL_SUBJECT_MAX_LENGTH)

  return { html, subject, text: htmlToPlainText(html) }
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function buildHtmlBlock(item: AddressCorrectionMailItem, index: number): string {
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  const font = ADDRESS_CORRECTION_MAIL_FONT_FAMILY
  const topPadding = index === 0 ? '20px' : '16px'

  return [
    `<tr><td style="padding:${topPadding} 28px 0;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${color.border};">`,

    `<tr><td style="background:${color.rowLabel};padding:12px 16px;font-family:${font};border-bottom:1px solid ${color.border};">`,
    `<span style="display:inline-block;min-width:22px;padding:2px 6px;margin-right:8px;background:${color.headerBackground};color:${color.headerText};font-size:12px;font-weight:bold;text-align:center;">${index + 1}</span> `,
    `<span style="font-size:15px;font-weight:bold;color:${color.ink};">${escapeHtml(itemHeading(item))}</span>`,
    '</td></tr>',

    `<tr><td style="padding:12px 16px 6px;font-family:${font};">`,
    `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${color.slate};">Como veio na nota</div>`,
    `<div style="font-size:14px;line-height:1.5;color:${color.slate};padding-top:2px;">${escapeHtml(formatAddress(item.reported))}</div>`,
    '</td></tr>',

    `<tr><td style="padding:6px 16px 12px;font-family:${font};">`,
    `<div style="border-left:4px solid ${color.greenBar};padding:4px 0 4px 12px;">`,
    `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${color.greenAccent};font-weight:bold;">Endereço correto</div>`,
    `<div style="font-size:15px;line-height:1.5;color:${color.ink};font-weight:bold;padding-top:2px;">${escapeHtml(formatAddress(item.proposed))}</div>`,
    '</div>',
    '</td></tr>',

    `<tr><td style="padding:0 16px 14px;font-family:${font};font-size:13px;color:${color.amber};">Motivo: ${escapeHtml(formatReason(item.reason))}.</td></tr>`,

    '</table>',
    '</td></tr>',
  ].join('')
}
