/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AddressFields } from '../application/address-correction.port.js'
import {
  ADDRESS_CORRECTION_MAIL_COLOR,
  ADDRESS_CORRECTION_MAIL_FONT_FAMILY,
  ADDRESS_CORRECTION_MAIL_WIDTH_PIXELS,
} from './address-correction-mail.constant.js'
import type {
  AddressCorrectionMailItem,
  AddressCorrectionMailReason,
  BuildAddressCorrectionMailParams,
  BuildAddressCorrectionMailResult,
} from './address-correction-mail.types.js'

const METRES_PER_KILOMETRE = 1000

/**
 * Função pura (RF9–RF12): monta o assunto, o HTML e o texto de reserva a partir dos mesmos dados —
 * nenhum I/O, nenhuma data/hora corrente. O desenho segue `email-template.html` (spec 150, aprovado
 * pelo usuário em 2026-09-15): layout em tabela, estilo inline, 600 px, preheader oculto, cabeçalho
 * grafite com filete cobre, um bloco numerado por endereço e rodapé dizendo que a nota não mudou.
 */
export function buildAddressCorrectionMail(
  params: BuildAddressCorrectionMailParams,
): BuildAddressCorrectionMailResult {
  const { carrierName, contractorName, items, operatorName } = params
  const count = items.length

  return {
    html: buildHtml({ carrierName, contractorName, count, items, operatorName }),
    subject: buildSubject(count),
    text: buildText({ carrierName, contractorName, items, operatorName }),
  }
}

function buildSubject(count: number): string {
  return `Correção de endereço de entrega — ${count} ${pluralize(count, 'cliente', 'clientes')}`
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

/**
 * `\r`, `\n`, `,`, `<` e `>` não aparecem em endereço válido de nota — o escape é para o texto livre
 * de terceiro (RF12), não para esses campos. `&` sempre primeiro: escapar os outros antes duplicaria
 * o `&amp;` que eles próprios introduzem.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * `logradouro, número[, complemento] — [bairro —] cidade/UF · CEP`, sem separador sobrando quando
 * complemento ou bairro faltam (T303).
 */
function formatAddress(fields: AddressFields): string {
  const hasComplement = fields.complement !== null && fields.complement.trim().length > 0
  const streetSegment = hasComplement
    ? `${fields.street}, ${fields.number}, ${fields.complement}`
    : `${fields.street}, ${fields.number}`

  const hasDistrict = fields.district !== null && fields.district.trim().length > 0
  const segments = hasDistrict
    ? [streetSegment, fields.district as string, `${fields.city}/${fields.state}`]
    : [streetSegment, `${fields.city}/${fields.state}`]

  return `${segments.join(' — ')} · ${formatPostalCode(fields.postalCode)}`
}

function formatPostalCode(postalCode: string): string {
  const digits = postalCode.replaceAll(/\D/gu, '')
  if (digits.length !== 8) return postalCode

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/**
 * Motivo em linguagem de leigo (RF11): sem distância útil (endereço não localizado, ou o provedor
 * só apontou o centro do município) vira "endereço não localizado" — é o que `distanceMetres: null`
 * significa em `address-report.port.ts` (`toDistance`, `compare-addresses-batch.use-case.ts`): sem
 * coordenada do provedor para medir, não há distância para mostrar. Havendo distância, abaixo de 1
 * km sai em metros inteiros; a partir de 1 km, em quilômetros com vírgula decimal e uma casa.
 */
function formatReason(reason: AddressCorrectionMailReason): string {
  if (reason.distanceMetres === null) return 'endereço não localizado'

  if (reason.distanceMetres < METRES_PER_KILOMETRE) {
    return `localizado a ${Math.round(reason.distanceMetres)} m do endereço informado`
  }

  const kilometres = (reason.distanceMetres / METRES_PER_KILOMETRE).toFixed(1).replace('.', ',')
  return `localizado a ${kilometres} km do endereço informado`
}

/** `null` → o bloco abre pelo endereço correto, sem nome nem "null" (T303). */
function itemHeading(item: AddressCorrectionMailItem): string {
  return item.recipientName ?? formatAddress(item.proposed)
}

function buildHtml(input: {
  readonly carrierName: string
  readonly contractorName: string
  readonly count: number
  readonly items: readonly AddressCorrectionMailItem[]
  readonly operatorName: string
}): string {
  const { carrierName, contractorName, count, items, operatorName } = input
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  const font = ADDRESS_CORRECTION_MAIL_FONT_FAMILY
  const subject = buildSubject(count)
  const preheader = `Não localizamos ${count} ${pluralize(count, 'endereço', 'endereços')} de entrega das suas notas. Veja o que veio e o endereço correto.`

  const blocks = items.map((item, index) => buildHtmlBlock(item, index)).join('')

  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(subject)}</title>`,
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
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h1>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Olá, equipe <strong>${escapeHtml(contractorName)}</strong>,</p>`,
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Ao roteirizar as entregas das suas notas, não conseguimos localizar os endereços abaixo. Hoje a entrega aponta para o centro do município.</p>',
    '<p style="margin:0;font-size:15px;line-height:1.6;">Pedimos que confira e corrija o cadastro desses clientes no seu sistema, para que as próximas notas já saiam com o endereço certo.</p>',
    '</td></tr>',

    blocks,

    `<tr><td style="padding:24px 28px 8px;font-family:${font};color:${color.ink};">`,
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Qualquer dúvida, é só responder este e-mail.</p>',
    `<p style="margin:0;font-size:15px;line-height:1.5;"><strong>${escapeHtml(operatorName)}</strong><br><span style="color:${color.slate};">${escapeHtml(carrierName)}</span></p>`,
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

function buildHtmlBlock(item: AddressCorrectionMailItem, index: number): string {
  const color = ADDRESS_CORRECTION_MAIL_COLOR
  const font = ADDRESS_CORRECTION_MAIL_FONT_FAMILY
  const topPadding = index === 0 ? '20px' : '16px'

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

    `<tr><td style="padding:0 16px 14px;font-family:${font};font-size:13px;color:${color.amber};">`,
    `<strong>Motivo:</strong> ${escapeHtml(formatReason(item.reason))}.`,
    '</td></tr>',

    '</table>',
    '</td></tr>',
  ].join('')
}

function buildText(input: {
  readonly carrierName: string
  readonly contractorName: string
  readonly items: readonly AddressCorrectionMailItem[]
  readonly operatorName: string
}): string {
  const { carrierName, contractorName, items, operatorName } = input

  const blocks = items.map((item, index) => buildTextBlock(item, index))

  return [
    `Olá, equipe ${contractorName},`,
    '',
    'Ao roteirizar as entregas das suas notas, não conseguimos localizar os endereços abaixo. Hoje a entrega aponta para o centro do município.',
    '',
    'Pedimos que confira e corrija o cadastro desses clientes no seu sistema, para que as próximas notas já saiam com o endereço certo.',
    '',
    ...blocks,
    'Qualquer dúvida, é só responder este e-mail.',
    '',
    operatorName,
    carrierName,
    '',
    `Você recebeu este e-mail por ser contato cadastrado da ${contractorName} junto à ${carrierName}. As notas fiscais não foram alteradas: a correção vale a partir do seu cadastro.`,
  ].join('\n')
}

function buildTextBlock(item: AddressCorrectionMailItem, index: number): string {
  return [
    `${index + 1}. ${itemHeading(item)}`,
    `Como veio na nota: ${formatAddress(item.reported)}`,
    `Endereço correto: ${formatAddress(item.proposed)}`,
    `Motivo: ${formatReason(item.reason)}.`,
    '',
  ].join('\n')
}
