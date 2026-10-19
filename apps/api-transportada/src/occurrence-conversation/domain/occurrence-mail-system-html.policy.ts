/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §5, D5): as quatro variáveis de HTML do sistema — logo (ou iniciais), tabela de itens, marcas do
 * rodapé e faixa de resposta. É a única fonte de HTML sem escape do e-mail: **tudo o que carrega é escapado aqui**
 * (nome de exibição, iniciais, código, item, quantidade, valor, origem do painel). Pura.
 */
import { renderEmailLogoHtml } from '@adatechnology/notification-contracts'
import { escapeMailHtml } from '../../contractor-mail/domain/mail-template-render.policy.js'
import {
  OCCURRENCE_ITEM_LINES_LIMIT,
  type OccurrenceMailSystemHtmlVariable,
} from './occurrence-contractor-mail.constant.js'
import {
  ADA_MARK_PATH,
  COMPANY_LOGO_CONTENT_ID,
  COMPANY_LOGO_SIZE,
  OCCURRENCE_MAIL_COLORS,
  OCCURRENCE_MAIL_FONT,
  OCCURRENCE_MAIL_REPLY_STRIP,
  PRODUCT_MARK_PATH,
} from './occurrence-mail-html.constant.js'

/** Uma linha da tabela, já formatada como o texto a mostra (a quantidade com a unidade, o valor com `R$`). */
export type OccurrenceMailItemRow = {
  readonly amount: string
  readonly code: string
  readonly description: string
  readonly quantity: string
}

export type BuildOccurrenceMailSystemHtmlParams = {
  /** Origem do painel; ausente (ou que não é http/https), as marcas saem só em texto. */
  readonly appBaseUrl: string | undefined
  readonly displayName: string
  readonly hasLogo: boolean
  /** A mensagem sai com `Reply-To`: só então a faixa "Responda este e-mail" aparece. */
  readonly hasReplyTo: boolean
  /** As iniciais de quem assina; saem no quadrado da assinatura quando ele não leva o logo nem a foto. */
  readonly signerInitials: string
  /** A foto de quem assina, por endereço público; ausente, sem foto ou sem origem pública da API. */
  readonly signerPictureUrl?: string | undefined
  /** O logo por endereço público estável (`API_PUBLIC_URL`); ausente, o logo vai por `cid:`. */
  readonly logoUrl?: string | undefined
  /** A equipe assina (sem pessoa): o quadrado da assinatura leva o logo da transportadora, se houver. */
  readonly signerIsTeam: boolean
  /** Todas as linhas; a tabela mostra até `OCCURRENCE_ITEM_LINES_LIMIT` e conta o resto. */
  readonly itemRows: readonly OccurrenceMailItemRow[]
  /** A soma das linhas (`somaItens`, formatada); vazia, a linha de total não aparece. */
  readonly itemsSum: string
}

export type OccurrenceMailSystemHtml = {
  /** O logo vai por `cid:` — o envio anexa a parte inline; sem logo, são as iniciais e não há parte. */
  readonly hasInlineLogo: boolean
  readonly systemHtml: Readonly<Record<OccurrenceMailSystemHtmlVariable, string>>
}

/** O quadrado da assinatura no modelo (`width="40"`). */
const SIGNATURE_SIZE = 40

function publicImage(params: {
  readonly alt: string
  readonly size: number
  readonly url: string
}): string {
  const { alt, size, url } = params
  return `<img src="${escapeMailHtml(url)}" alt="${escapeMailHtml(alt)}" width="${size}" height="${size}" style="display:block;border:0;width:${size}px;height:${size}px">`
}

const HTTP_ORIGIN = /^https?:\/\//iu
const TRAILING_SLASHES = /\/+$/u
const { asphalt, copper, ink, mist, rule, slate } = OCCURRENCE_MAIL_COLORS

function buildLogo(params: BuildOccurrenceMailSystemHtmlParams): string {
  const { displayName, hasLogo, logoUrl } = params
  if (hasLogo && logoUrl !== undefined)
    return publicImage({ alt: displayName, size: COMPANY_LOGO_SIZE, url: logoUrl })
  return renderEmailLogoHtml({
    displayName,
    logo: hasLogo ? { contentId: COMPANY_LOGO_CONTENT_ID, kind: 'cid' } : { kind: 'initials' },
  })
}

/**
 * A célula é curta de propósito: com 200 linhas o estilo repetido é o que pesa (a cor do texto vem da tabela, que ela
 * herda sem depender do cliente de e-mail).
 */
const CELL = `padding:5px 8px;border-bottom:1px solid ${rule};font:13px ${OCCURRENCE_MAIL_FONT}`
const HEAD_CELL = `padding:5px 8px;border-bottom:2px solid ${asphalt};font:700 11px ${OCCURRENCE_MAIL_FONT};text-transform:uppercase;color:${slate}`

function buildItemsTable(rows: readonly OccurrenceMailItemRow[], itemsSum: string): string {
  if (rows.length === 0) return ''
  const shown = rows.slice(0, OCCURRENCE_ITEM_LINES_LIMIT)
  const omitted = rows.length - shown.length
  const body = shown
    .map(
      (row) =>
        `<tr><td style="${CELL}">${escapeMailHtml(row.code)}</td><td style="${CELL}">${escapeMailHtml(row.description)}</td><td align="right" style="${CELL}">${escapeMailHtml(row.quantity)}</td><td align="right" style="${CELL}">${escapeMailHtml(row.amount)}</td></tr>`,
    )
    .join('')
  const omittedRow =
    omitted > 0
      ? `<tr><td colspan="4" style="${CELL};color:${slate}">e mais ${omitted} ${omitted === 1 ? 'item' : 'itens'}</td></tr>`
      : ''
  const totalRow =
    itemsSum === ''
      ? ''
      : `<tr><td colspan="3" align="right" style="${CELL};font-weight:700">Total dos itens</td><td align="right" style="${CELL};font-weight:700">R$ ${escapeMailHtml(itemsSum)}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;color:${ink}"><tr><th align="left" style="${HEAD_CELL}">Código</th><th align="left" style="${HEAD_CELL}">Item</th><th align="right" style="${HEAD_CELL}">Qtd.</th><th align="right" style="${HEAD_CELL}">Valor</th></tr>${body}${omittedRow}${totalRow}</table>`
}

const FOOTER_TEXT = `font-family:${OCCURRENCE_MAIL_FONT};font-size:11px;color:${slate}`

/** A miniatura de 20px ao lado do nome que ela identifica — o desenho aprovado (spec 272). */
function footerMark(url: string | undefined, height: number): string {
  if (url === undefined) return ''
  return `<img src="${escapeMailHtml(url)}" alt="" height="${height}" style="vertical-align:middle;margin-right:6px;border:0;height:${height}px">`
}

function buildFooterMarks(appBaseUrl: string | undefined): string {
  const origin =
    appBaseUrl !== undefined && HTTP_ORIGIN.test(appBaseUrl)
      ? appBaseUrl.replace(TRAILING_SLASHES, '')
      : undefined
  const productMark = footerMark(
    origin === undefined ? undefined : `${origin}${PRODUCT_MARK_PATH}`,
    20,
  )
  const platformMark = footerMark(
    origin === undefined ? undefined : `${origin}${ADA_MARK_PATH}`,
    20,
  )
  const text = (value: string): string =>
    `<span style="${FOOTER_TEXT}">${escapeMailHtml(value)}</span>`
  const name = (value: string): string => `<b style="${FOOTER_TEXT}">${escapeMailHtml(value)}</b>`
  return `${productMark}${text('Enviado pelo ')}${name('TransportAdA')}${text(' — uma solução ')}${platformMark}${name('Ada Technology')}`
}

function buildReplyStrip(hasReplyTo: boolean): string {
  if (!hasReplyTo) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:10px 14px;background:${mist};border-left:3px solid ${copper};font-family:${OCCURRENCE_MAIL_FONT};font-size:12px;color:${ink}">${escapeMailHtml(OCCURRENCE_MAIL_REPLY_STRIP)}</td></tr></table>`
}

function buildSignatureLogo(params: BuildOccurrenceMailSystemHtmlParams): string {
  if (!params.signerIsTeam && params.signerPictureUrl !== undefined) {
    return publicImage({
      alt: params.signerInitials,
      size: SIGNATURE_SIZE,
      url: params.signerPictureUrl,
    })
  }
  if (!(params.signerIsTeam && params.hasLogo)) return escapeMailHtml(params.signerInitials)
  if (params.logoUrl !== undefined) {
    return publicImage({ alt: params.displayName, size: SIGNATURE_SIZE, url: params.logoUrl })
  }
  return `<img src="cid:${COMPANY_LOGO_CONTENT_ID}" alt="${escapeMailHtml(params.displayName)}" width="${SIGNATURE_SIZE}" height="${SIGNATURE_SIZE}" style="display:block;border:0;width:${SIGNATURE_SIZE}px;height:${SIGNATURE_SIZE}px">`
}

export function buildOccurrenceMailSystemHtml(
  params: BuildOccurrenceMailSystemHtmlParams,
): OccurrenceMailSystemHtml {
  return {
    /** O `cid:` só existe sem endereço público; com ele, o e-mail não leva a parte inline. */
    hasInlineLogo: params.hasLogo && params.logoUrl === undefined,
    systemHtml: {
      faixaResposta: buildReplyStrip(params.hasReplyTo),
      logoAssinatura: buildSignatureLogo(params),
      logoTransportadora: buildLogo(params),
      marcasRodape: buildFooterMarks(params.appBaseUrl),
      tabelaItens: buildItemsTable(params.itemRows, params.itemsSum),
    },
  }
}
