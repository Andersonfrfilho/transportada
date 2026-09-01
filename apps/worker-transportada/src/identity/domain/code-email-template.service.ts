/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A moldura HTML dos e-mails de código de acesso — convite e recuperação de senha.
 *
 * Mora no worker, que é quem envia, e não num pacote: a marca é deste produto, e esta app não
 * importa código de nenhuma outra (`code-standart.md` §2).
 *
 * As restrições explicam o código feio: tabela em vez de flex, estilo em atributo em vez de classe,
 * e nada de folha de estilo. Cliente de e-mail não é navegador — o Outlook desenha com o motor do
 * Word, e o Gmail remove `<style>` no encaminhamento.
 *
 * ⚠️ As cores da moldura são literais **de propósito**: são cópia por valor dos tokens de
 * `frontend-transportada/src/styles/index.css`, porque o e-mail não carrega o nosso CSS e o worker
 * não importa código do frontend. Mudou a paleta lá? mude aqui — o contrato
 * `test/invitation-delivery/email-layout.contract.ts` é o que lembra.
 */
const EMAIL_PALETTE = {
  accent: '#d58a47',
  background: '#10222c',
  border: '#1c2b33',
  muted: '#8fa3ad',
  surface: '#1c2b33',
  text: '#f0f2ee',
} as const

const EMAIL_MAX_WIDTH = 600
const PRODUCT_NAME = 'TransportAdA'
const COPYRIGHT_HOLDER = 'Ada Technology'
const COPYRIGHT_HOLDER_URL = 'https://adatechnology.com.br'
/**
 * Cópia por valor do caminho que o painel publica (`ApplicationFooter.component.tsx`) — o worker não
 * lê o `public/` do frontend, e o e-mail precisa de URL absoluta. Sem `appBaseUrl` o desenho não
 * entra, e a assinatura segue em texto.
 */
const ADA_MARK_PATH = '/icons/ada-technology.png'
const AUTOMATED_NOTE = 'Mensagem automática — não responda este e-mail.'

/** Hex de 6 dígitos, `#rrggbb`, como o CHECK de `landing_settings` exige. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu

/**
 * A marca que assina o e-mail. Tudo é opcional porque tudo vem do cadastro que o operador edita no
 * painel (aba **Site**): instalação recém-provisionada não tem logotipo, nem cor, nem telefone, e
 * nenhuma dessas ausências é motivo para o código de acesso não sair.
 */
export type CodeEmailBrand = {
  readonly accentColor: string | undefined
  /** Origem do painel — é dela que sai o desenho da Ada no rodapé. */
  readonly appBaseUrl: string | undefined
  readonly contactEmail: string | undefined
  readonly contactPhone: string | undefined
  readonly logoUrl: string | undefined
  readonly name: string | undefined
}

export type CodeEmailContent = {
  readonly code: string
  readonly headline: string
  readonly intro: string
  readonly note: string
}

export type CodeEmailDocument = {
  readonly html: string
  readonly text: string
}

/**
 * Entidade HTML no lugar do caractere. O texto vem do template editável no painel e do cadastro da
 * marca — sem escapar, um `<` digitado quebra o documento, e uma tag colada de outro lugar entra no
 * e-mail de todo mundo.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Linha em branco separa parágrafo; quebra simples vira `<br>`, como quem digitou espera. */
function toParagraphs(body: string): string {
  return body
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map(
      (block) =>
        `<p style="margin:0 0 16px;color:${EMAIL_PALETTE.text};font-size:15px;line-height:1.6">${escapeHtml(
          block,
        ).replaceAll('\n', '<br>')}</p>`,
    )
    .join('')
}

/**
 * ⚠️ **Imagem em e-mail chega bloqueada por padrão**, e é por isso que nenhuma delas carrega
 * informação: o logotipo da transportadora vem ao lado do nome dela em texto, e o desenho da Ada ao
 * lado da assinatura em texto. Com as imagens bloqueadas o e-mail perde enfeite, nunca conteúdo —
 * era essa a razão de a moldura anterior não ter `<img>` nenhuma.
 */
export function renderCodeEmail(input: {
  readonly brand: CodeEmailBrand
  readonly content: CodeEmailContent
  readonly year: number
}): CodeEmailDocument {
  const { brand, content, year } = input
  const accent = resolveAccentColor(brand.accentColor)
  const brandName = brand.name ?? PRODUCT_NAME

  return {
    html: [
      '<!doctype html>',
      '<html lang="pt-BR"><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="x-apple-disable-message-reformatting">',
      `<title>${escapeHtml(content.headline)}</title>`,
      '</head>',
      `<body style="margin:0;padding:24px 0;background:${EMAIL_PALETTE.background}">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_PALETTE.background}">`,
      '<tr><td align="center">',
      `<table role="presentation" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_MAX_WIDTH}px;background:${EMAIL_PALETTE.surface};border:1px solid ${EMAIL_PALETTE.border}">`,
      renderHeader({ accent, brandName, logoUrl: brand.logoUrl }),
      renderBody({ accent, content }),
      renderCompanyFooter({ brand, brandName }),
      renderProductFooter({ appBaseUrl: brand.appBaseUrl, year }),
      '</table></td></tr></table></body></html>',
    ].join(''),
    text: [
      brandName,
      '',
      content.headline,
      content.intro,
      content.code,
      content.note,
      '',
      AUTOMATED_NOTE,
      '',
      ...(brand.contactEmail === undefined ? [] : [brand.contactEmail]),
      ...(brand.contactPhone === undefined ? [] : [brand.contactPhone]),
      `© ${year} ${COPYRIGHT_HOLDER} — ${PRODUCT_NAME} · ${COPYRIGHT_HOLDER_URL}`,
    ].join('\n'),
  }
}

function resolveAccentColor(value: string | undefined): string {
  return value !== undefined && HEX_COLOR_PATTERN.test(value) ? value : EMAIL_PALETTE.accent
}

/** O nome da transportadora é texto; o logotipo, quando existe, entra ao lado dele. */
function renderHeader(input: {
  readonly accent: string
  readonly brandName: string
  readonly logoUrl: string | undefined
}): string {
  const logo =
    input.logoUrl === undefined
      ? ''
      : `<img src="${escapeHtml(input.logoUrl)}" alt="" height="32" style="display:block;margin:0 auto 8px;max-height:32px;border:0">`

  return [
    `<tr><td align="center" style="padding:24px 24px 8px;border-bottom:1px solid ${input.accent}">`,
    logo,
    `<span style="color:${input.accent};font-size:13px;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(input.brandName)}</span>`,
    '</td></tr>',
  ].join('')
}

function renderBody(input: {
  readonly accent: string
  readonly content: CodeEmailContent
}): string {
  const { accent, content } = input
  const note =
    content.note === ''
      ? ''
      : `<p style="margin:0 0 8px;color:${EMAIL_PALETTE.text};font-size:14px;line-height:1.6">${escapeHtml(content.note)}</p>`

  return [
    '<tr><td style="padding:24px 24px 8px">',
    `<h1 style="margin:0 0 16px;color:${EMAIL_PALETTE.text};font-size:20px;line-height:1.3">${escapeHtml(content.headline)}</h1>`,
    toParagraphs(content.intro),
    `<p style="margin:0 0 16px;padding:16px;background:${EMAIL_PALETTE.background};border-left:4px solid ${accent};color:${EMAIL_PALETTE.text};font-size:26px;letter-spacing:3px;font-weight:bold;text-align:center">${escapeHtml(content.code)}</p>`,
    note,
    `<p style="margin:0 0 16px;color:${EMAIL_PALETTE.muted};font-size:12px">${escapeHtml(AUTOMATED_NOTE)}</p>`,
    '</td></tr>',
  ].join('')
}

/** Quem manda o e-mail é a transportadora, e é o contato dela que resolve dúvida de quem recebe. */
function renderCompanyFooter(input: {
  readonly brand: CodeEmailBrand
  readonly brandName: string
}): string {
  const lines = [
    `<strong style="color:${EMAIL_PALETTE.text}">${escapeHtml(input.brandName)}</strong>`,
    ...(input.brand.contactEmail === undefined
      ? []
      : [
          `<a href="mailto:${escapeHtml(input.brand.contactEmail)}" style="color:${EMAIL_PALETTE.muted}">${escapeHtml(input.brand.contactEmail)}</a>`,
        ]),
    ...(input.brand.contactPhone === undefined ? [] : [escapeHtml(input.brand.contactPhone)]),
  ]

  return [
    `<tr><td style="padding:16px 24px;border-top:1px solid ${EMAIL_PALETTE.border};color:${EMAIL_PALETTE.muted};font-size:12px;line-height:1.6">`,
    lines.join('<br>'),
    '</td></tr>',
  ].join('')
}

/**
 * A assinatura do produto é a mesma do rodapé do painel: desenho da Ada, o ano e o link para o site.
 * Aqui ela é obrigatória — o e-mail é o único lugar onde quem recebe não tem a aplicação aberta para
 * saber de quem é o sistema.
 */
function renderProductFooter(input: {
  readonly appBaseUrl: string | undefined
  readonly year: number
}): string {
  const mark =
    input.appBaseUrl === undefined
      ? ''
      : `<img src="${escapeHtml(`${trimTrailingSlash(input.appBaseUrl)}${ADA_MARK_PATH}`)}" alt="" height="14" style="vertical-align:middle;margin-right:8px;border:0">`

  return [
    `<tr><td align="center" style="padding:12px 24px 20px;border-top:1px solid ${EMAIL_PALETTE.border};color:${EMAIL_PALETTE.muted};font-size:12px">`,
    mark,
    `<span style="vertical-align:middle">© ${input.year} <a href="${COPYRIGHT_HOLDER_URL}" style="color:${EMAIL_PALETTE.muted}">${COPYRIGHT_HOLDER}</a> — ${PRODUCT_NAME}</span>`,
    '</td></tr>',
  ].join('')
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
