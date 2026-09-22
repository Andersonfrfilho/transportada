/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  escapeMailHtml as escapeHtml,
  renderMailTemplate,
} from '../../contractor-mail/domain/mail-template-render.policy.js'
import {
  ADDRESS_CORRECTION_MAIL_COLOR,
  ADDRESS_CORRECTION_MAIL_FONT_FAMILY,
  ADDRESS_CORRECTION_MAIL_WIDTH_PIXELS,
} from './address-correction-mail.constant.js'
import {
  buildItemVariableValues,
  formatAddress,
  itemHeading,
} from './address-correction-mail-format.policy.js'
import type {
  AddressCorrectionMailItem,
  BuildAddressCorrectionMailParams,
  BuildAddressCorrectionMailResult,
} from './address-correction-mail.types.js'

type RenderedContent = {
  readonly closing: string
  readonly intro: string
  /** Um texto por item, na ordem dos itens — o `itemText` do modelo já com as variáveis dele. */
  readonly itemTexts: readonly string[]
  readonly subject: string
}

type LayoutInput = {
  readonly carrierName: string
  readonly content: RenderedContent
  readonly contractorName: string
  readonly items: readonly AddressCorrectionMailItem[]
}

const PARAGRAPH_BREAK = /\n\s*\n/u
const LINE_BREAKS = /\s*[\r\n]+\s*/gu

/**
 * Função pura (RF9–RF14): o texto vem do modelo (T402) e o layout segue `email-template.html`
 * (aprovado em 2026-09-15) — tabela, estilo inline, 600 px, preheader oculto, cabeçalho grafite com
 * filete cobre, um bloco numerado por endereço e rodapé dizendo que a nota não mudou. O modelo edita
 * texto, nunca a estrutura: nome, "como veio" e "endereço correto" de cada bloco são fixos, e o
 * `itemText` renderizado ocupa a linha de baixo do bloco (a do motivo, no desenho aprovado).
 */
export function buildAddressCorrectionMail(
  params: BuildAddressCorrectionMailParams,
): BuildAddressCorrectionMailResult {
  const { carrierName, contractorName, items, operatorName, template } = params
  const count = items.length
  const mailValues = {
    clientes: `${count} ${pluralize(count, 'cliente', 'clientes')}`,
    contratante: contractorName,
    operador: operatorName,
    quantidade: String(count),
    transportadora: carrierName,
  }
  const render = (text: string, values: Readonly<Record<string, string>>): string =>
    renderMailTemplate({ format: 'text', text, values })

  const content: RenderedContent = {
    closing: render(template.closing, mailValues).trim(),
    intro: render(template.intro, mailValues).trim(),
    itemTexts: items.map((item) =>
      render(template.itemText, { ...mailValues, ...buildItemVariableValues(item) }).trim(),
    ),
    /** Assunto vira cabeçalho: nenhuma quebra de linha vinda de valor sobrevive. */
    subject: render(template.subject, mailValues).replaceAll(LINE_BREAKS, ' ').trim(),
  }
  const layout = { carrierName, content, contractorName, items }

  return { html: buildHtml(layout), subject: content.subject, text: buildText(layout) }
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

/** Parágrafos separados por linha em branco; dentro do parágrafo, cada linha vira `<br>`. */
function toParagraphs(text: string): readonly (readonly string[])[] {
  return text
    .split(PARAGRAPH_BREAK)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
    .filter((lines) => lines.length > 0)
}

function escapeLines(lines: readonly string[]): string {
  return lines.map(escapeHtml).join('<br>')
}

function buildIntroHtml(intro: string): string {
  const paragraphs = toParagraphs(intro)
  return paragraphs
    .map((lines, index) => {
      const margin = index === paragraphs.length - 1 ? '0' : '0 0 12px'
      return `<p style="margin:${margin};font-size:15px;line-height:1.6;">${escapeLines(lines)}</p>`
    })
    .join('')
}

/**
 * Com mais de um parágrafo, o último é a assinatura do desenho aprovado: primeira linha em negrito
 * (quem assina) e as demais em cinza (a transportadora). Um parágrafo só sai como texto comum.
 */
function buildClosingHtml(closing: string): string {
  const paragraphs = toParagraphs(closing)
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  if (paragraphs.length < 2) {
    return paragraphs
      .map(
        (lines) => `<p style="margin:0;font-size:15px;line-height:1.6;">${escapeLines(lines)}</p>`,
      )
      .join('')
  }

  const body = paragraphs
    .slice(0, -1)
    .map(
      (lines) =>
        `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeLines(lines)}</p>`,
    )
    .join('')
  const [signer = '', ...rest] = paragraphs.at(-1) ?? []
  const detail =
    rest.length === 0 ? '' : `<br><span style="color:${color.slate};">${escapeLines(rest)}</span>`
  return `${body}<p style="margin:0;font-size:15px;line-height:1.5;"><strong>${escapeHtml(signer)}</strong>${detail}</p>`
}

function buildHtml(input: LayoutInput): string {
  const { carrierName, content, contractorName, items } = input
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  const font = ADDRESS_CORRECTION_MAIL_FONT_FAMILY
  const count = items.length
  const preheader = `Não localizamos ${count} ${pluralize(count, 'endereço', 'endereços')} de entrega das suas notas. Veja o que veio e o endereço correto.`

  const blocks = items
    .map((item, index) => buildHtmlBlock({ index, item, itemText: content.itemTexts[index] ?? '' }))
    .join('')

  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(content.subject)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:${color.pageBackground};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${color.pageBackground};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="${ADDRESS_CORRECTION_MAIL_WIDTH_PIXELS}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${ADDRESS_CORRECTION_MAIL_WIDTH_PIXELS}px;background:${color.white};border:1px solid ${color.border};">`,

    `<tr><td style="background:${color.headerBackground};padding:20px 28px;border-bottom:4px solid ${color.copperRule};">`,
    `<div style="font-family:${font};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${color.copperRule};">Correção de cadastro</div>`,
    `<div style="font-family:${font};font-size:22px;font-weight:bold;color:${color.headerText};padding-top:6px;">${escapeHtml(carrierName)}</div>`,
    '</td></tr>',

    `<tr><td style="padding:28px 28px 8px;font-family:${font};color:${color.ink};">`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(content.subject)}</h1>`,
    buildIntroHtml(content.intro),
    '</td></tr>',

    blocks,

    `<tr><td style="padding:24px 28px 8px;font-family:${font};color:${color.ink};">`,
    buildClosingHtml(content.closing),
    '</td></tr>',

    `<tr><td style="padding:20px 28px;border-top:1px solid ${color.footerBorder};font-family:${font};font-size:12px;line-height:1.5;color:${color.slate};">`,
    `Você recebeu este e-mail por ser contato cadastrado da ${escapeHtml(contractorName)} junto à ${escapeHtml(carrierName)}. As notas fiscais não foram alteradas: a correção vale a partir do seu cadastro.`,
    '</td></tr>',

    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('')
}

function buildHtmlBlock(input: {
  readonly index: number
  readonly item: AddressCorrectionMailItem
  readonly itemText: string
}): string {
  const { index, item, itemText } = input
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  const font = ADDRESS_CORRECTION_MAIL_FONT_FAMILY
  const topPadding = index === 0 ? '20px' : '16px'
  const itemRow =
    itemText.length === 0
      ? ''
      : `<tr><td style="padding:0 16px 14px;font-family:${font};font-size:13px;color:${color.amber};">${escapeLines(itemText.split('\n'))}</td></tr>`

  return [
    `<tr><td style="padding:${topPadding} 28px 0;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${color.border};">`,

    `<tr><td style="background:${color.rowLabel};padding:12px 16px;font-family:${font};border-bottom:1px solid ${color.border};">`,
    `<span style="display:inline-block;min-width:22px;padding:2px 6px;margin-right:8px;background:${color.headerBackground};color:${color.headerText};font-size:12px;font-weight:bold;text-align:center;">${index + 1}</span>`,
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

    itemRow,

    '</table>',
    '</td></tr>',
  ].join('')
}

function buildText(input: LayoutInput): string {
  const { carrierName, content, contractorName, items } = input
  const blocks = items.map((item, index) =>
    [
      `${index + 1}. ${itemHeading(item)}`,
      `Como veio na nota: ${formatAddress(item.reported)}`,
      `Endereço correto: ${formatAddress(item.proposed)}`,
      ...(content.itemTexts[index] ? [content.itemTexts[index]] : []),
      '',
    ].join('\n'),
  )

  return [
    content.intro,
    '',
    ...blocks,
    content.closing,
    '',
    `Você recebeu este e-mail por ser contato cadastrado da ${contractorName} junto à ${carrierName}. As notas fiscais não foram alteradas: a correção vale a partir do seu cadastro.`,
  ].join('\n')
}
