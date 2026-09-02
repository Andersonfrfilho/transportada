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

/**
 * ⚠️ Sem `font-family` **em cada elemento** o cliente de e-mail cai no padrão dele, que é serifado —
 * era o que fazia o e-mail parecer de outro produto. Herança por tabela não é confiável no Outlook,
 * então a pilha é repetida em toda declaração, e ela é longa porque a fonte do painel não existe em
 * Windows: `Avenir Next` no Mac, `Segoe UI` no Windows, `Roboto` no Android, e Arial no resto.
 */
const EMAIL_FONTS = {
  body: "'Avenir Next',Avenir,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  /** O código é para ser lido caractere por caractere e digitado: monoespaçado, como no painel. */
  mono: "'SFMono-Regular',SFMono,Consolas,'Liberation Mono',Menlo,monospace",
} as const

const EMAIL_MAX_WIDTH = 600
const PRODUCT_NAME = 'TransportAdA'
const COPYRIGHT_HOLDER = 'Ada Technology'
const COPYRIGHT_HOLDER_URL = 'https://adatechnology.com.br'
/**
 * Cópias por valor dos caminhos que o painel publica — o worker não lê o `public/` do frontend, e o
 * e-mail precisa de URL absoluta. Sem `appBaseUrl` nenhum dos dois entra, e a assinatura segue em
 * texto: imagem quebrada assina pior.
 */
const PRODUCT_MARK_PATH = '/icons/icon-192.png'
const ADA_MARK_PATH = '/icons/ada-technology.png'
/** Busca por endereço no Google Maps: o link é **derivado**, nunca guardado — endereço muda, URL velha mente. */
const MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query='
/** `wa.me` é o encurtador oficial da Meta; o número vai só com dígitos, como o cadastro guarda. */
const WHATSAPP_URL = 'https://wa.me/'

/** Rota anônima da API, com o token opaco no lugar do identificador do usuário. */
const USER_PICTURE_PATH_PREFIX = '/public/company-users/'
const USER_PICTURE_PATH_SUFFIX = '/picture'
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
  /** Endereço da API: é dele que sai a foto de perfil, servida por rota anônima com token opaco. */
  readonly apiBaseUrl: string | undefined
  /** Origem do painel — é dela que saem as marcas do produto e da Ada no rodapé. */
  readonly appBaseUrl: string | undefined
  /** Spec 068: a lista de contatos cadastrada, na ordem que o operador definiu. */
  readonly contacts: readonly CodeEmailContact[]
  readonly contactEmail: string | undefined
  readonly contactPhone: string | undefined
  readonly logoUrl: string | undefined
  readonly name: string | undefined
  readonly socialLinks: readonly CodeEmailSocialLink[]
}

/**
 * Identificação legal da pessoa jurídica que manda o e-mail. Só entra quando **não** há destinatário
 * pessoa: sem identidade no cabeçalho, é o rodapé que responde de quem a mensagem é.
 */
export type CodeEmailLegalIdentification = {
  readonly city: string
  /** Contato fiscal: entra no rodapé só quando a lista de contatos não tem daquele tipo. */
  readonly email: string
  readonly phone: string
  readonly complement: string
  readonly district: string
  readonly legalName: string
  readonly number: string
  readonly postalCode: string
  readonly state: string
  readonly street: string
  readonly taxId: string
}

/**
 * Um contato de atendimento da empresa (spec 068). Telefone marcado como WhatsApp ganha o link do
 * aplicativo **ao lado** do `tel:`, nunca no lugar dele: nem todo telefone com WhatsApp é celular de
 * quem prefere mensagem, e quem quer ligar continua com um toque só.
 */
export type CodeEmailContact = {
  readonly isWhatsapp: boolean
  readonly kind: 'phone' | 'email'
  readonly label: string
  readonly value: string
}

export type CodeEmailSocialLink = {
  readonly network: string
  readonly url: string
}

/** Quem recebe o código. Sem foto cadastrada, a inicial do nome ocupa o lugar do retrato. */
export type CodeEmailRecipient = {
  readonly name: string
  readonly pictureToken: string | undefined
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
        `<p style="margin:0 0 16px;color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.body};font-size:15px;line-height:1.6">${escapeHtml(
          block,
        ).replaceAll('\n', '<br>')}</p>`,
    )
    .join('')
}

/**
 * ⚠️ **Imagem em e-mail chega bloqueada por padrão**, e é por isso que nenhuma delas carrega
 * informação: o logotipo da transportadora vem acima do nome dela em texto, o retrato vem ao lado do
 * nome de quem recebe, e as marcas do rodapé ao lado da assinatura escrita. Com as imagens
 * bloqueadas o e-mail perde enfeite, nunca conteúdo.
 */
export function renderCodeEmail(input: {
  readonly brand: CodeEmailBrand
  readonly content: CodeEmailContent
  /**
   * A identificação legal do remetente, para e-mail do sistema. Passá-la junto com `recipient` é
   * contradição — o template ignora a legal quando há pessoa, e é o cabeçalho que identifica.
   */
  readonly legal?: CodeEmailLegalIdentification
  readonly recipient?: CodeEmailRecipient
  readonly year: number
}): CodeEmailDocument {
  const { brand, content, recipient, year } = input
  const legal = recipient === undefined ? input.legal : undefined
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
      `<body style="margin:0;padding:24px 0;background:${EMAIL_PALETTE.background};font-family:${EMAIL_FONTS.body}">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_PALETTE.background}">`,
      '<tr><td align="center">',
      `<table role="presentation" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_MAX_WIDTH}px;background:${EMAIL_PALETTE.surface};border:1px solid ${EMAIL_PALETTE.border}">`,
      renderHeader({ accent, brandName, logoUrl: brand.logoUrl }),
      renderIdentity({ accent, apiBaseUrl: brand.apiBaseUrl, recipient }),
      renderBody({ accent, content }),
      renderCompanyFooter({ brand, brandName, legal }),
      renderProductFooter({ appBaseUrl: brand.appBaseUrl, year }),
      '</table></td></tr></table></body></html>',
    ].join(''),
    text: [
      brandName,
      ...(recipient === undefined ? [] : ['', recipient.name]),
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
      ...(legal === undefined
        ? []
        : [`CNPJ ${formatTaxId(legal.taxId)}`, ...toAddressLines(legal)]),
      `© ${year} ${COPYRIGHT_HOLDER} — ${PRODUCT_NAME} · ${COPYRIGHT_HOLDER_URL}`,
    ].join('\n'),
  }
}

function resolveAccentColor(value: string | undefined): string {
  return value !== undefined && HEX_COLOR_PATTERN.test(value) ? value : EMAIL_PALETTE.accent
}

/**
 * A máscara do CNPJ é por **posição**, nunca por dígito: desde a IN RFB 2229/2024 a base tem letra,
 * e um formatador que filtra dígito imprime documento alfanumérico sob máscara errada. Comprimento
 * diferente de 14 sai como veio — melhor cru do que mascarado errado.
 */
function formatTaxId(value: string): string {
  const canonical = value.replaceAll(/[^0-9A-Za-z]/gu, '').toUpperCase()
  if (canonical.length !== 14) return value

  return [
    canonical.slice(0, 2),
    '.',
    canonical.slice(2, 5),
    '.',
    canonical.slice(5, 8),
    '/',
    canonical.slice(8, 12),
    '-',
    canonical.slice(12),
  ].join('')
}

/** CEP com máscara, e o complemento só quando existe — endereço não imprime campo vazio. */
function toAddressLines(legal: CodeEmailLegalIdentification): readonly string[] {
  const street = [legal.street, legal.number].filter((part) => part !== '').join(', ')
  const firstLine = [street, legal.complement, legal.district]
    .filter((part) => part !== '')
    .join(' · ')
  const postalCode =
    legal.postalCode.length === 8
      ? `${legal.postalCode.slice(0, 5)}-${legal.postalCode.slice(5)}`
      : legal.postalCode
  const secondLine = [[legal.city, legal.state].filter((part) => part !== '').join('/'), postalCode]
    .filter((part) => part !== '')
    .join(' · ')

  return [firstLine, secondLine].filter((line) => line !== '')
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/** O topo é da empresa que contratou o sistema: o logotipo dela, e o nome dela em texto embaixo. */
function renderHeader(input: {
  readonly accent: string
  readonly brandName: string
  readonly logoUrl: string | undefined
}): string {
  const logo =
    input.logoUrl === undefined
      ? ''
      : `<img src="${escapeHtml(input.logoUrl)}" alt="" height="48" style="display:block;margin:0 auto 12px;max-height:48px;border:0">`

  return [
    `<tr><td align="center" style="padding:24px 24px 14px;border-bottom:1px solid ${input.accent}">`,
    logo,
    `<span style="color:${input.accent};font-family:${EMAIL_FONTS.body};font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(input.brandName)}</span>`,
    '</td></tr>',
  ].join('')
}

/**
 * A identidade de quem recebe: retrato quando a ficha tem um, e a inicial do nome quando não. Isto
 * existe porque o e-mail é endereçado a uma pessoa — quem recebe um código precisa reconhecer, antes
 * de digitar qualquer coisa, que a mensagem é para a conta dele.
 */
function renderIdentity(input: {
  readonly accent: string
  readonly apiBaseUrl: string | undefined
  readonly recipient: CodeEmailRecipient | undefined
}): string {
  const { accent, apiBaseUrl, recipient } = input
  if (recipient === undefined) return ''

  const pictureUrl =
    recipient.pictureToken === undefined || apiBaseUrl === undefined
      ? undefined
      : `${trimTrailingSlash(apiBaseUrl)}${USER_PICTURE_PATH_PREFIX}${recipient.pictureToken}${USER_PICTURE_PATH_SUFFIX}`
  const portrait =
    pictureUrl === undefined
      ? `<span style="display:inline-block;width:36px;height:36px;background:${accent};border-radius:18px;color:${EMAIL_PALETTE.background};font-family:${EMAIL_FONTS.body};font-size:16px;font-weight:700;line-height:36px;text-align:center">${escapeHtml(toInitial(recipient.name))}</span>`
      : `<img src="${escapeHtml(pictureUrl)}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:18px;border:0;object-fit:cover">`

  return [
    `<tr><td style="padding:16px 24px 0">`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td style="padding-right:12px" valign="middle">${portrait}</td>`,
    `<td valign="middle"><span style="color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.body};font-size:15px;font-weight:600">${escapeHtml(recipient.name)}</span></td>`,
    '</tr></table>',
    '</td></tr>',
  ].join('')
}

/** Primeira letra do nome, em caixa alta — o retrato que existe para toda ficha, sem arquivo. */
function toInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? '?' : (trimmed[0] ?? '?').toLocaleUpperCase('pt-BR')
}

function renderBody(input: {
  readonly accent: string
  readonly content: CodeEmailContent
}): string {
  const { accent, content } = input
  const note =
    content.note === ''
      ? ''
      : `<p style="margin:0 0 8px;color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.body};font-size:14px;line-height:1.6">${escapeHtml(content.note)}</p>`

  return [
    '<tr><td style="padding:20px 24px 8px">',
    `<h1 style="margin:0 0 16px;color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.body};font-size:20px;font-weight:600;line-height:1.3">${escapeHtml(content.headline)}</h1>`,
    toParagraphs(content.intro),
    `<p style="margin:0 0 16px;padding:16px;background:${EMAIL_PALETTE.background};border-left:4px solid ${accent};color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.mono};font-size:24px;font-weight:700;letter-spacing:2px;text-align:center">${escapeHtml(content.code)}</p>`,
    note,
    `<p style="margin:0 0 16px;color:${EMAIL_PALETTE.muted};font-family:${EMAIL_FONTS.body};font-size:12px;line-height:1.5">${escapeHtml(AUTOMATED_NOTE)}</p>`,
    '</td></tr>',
  ].join('')
}

/**
 * Quem manda o e-mail é a transportadora, e é o contato dela que resolve dúvida de quem recebe. No
 * e-mail do sistema entram também a razão social, o CNPJ e o endereço — quem recebe uma mensagem sem
 * nome no cabeçalho tem o direito de saber que pessoa jurídica a mandou, e de onde.
 *
 * Os contatos vêm da lista cadastrada (spec 068). O par `contactEmail`/`contactPhone` do cadastro do
 * site entra **como reserva**, e só quando a lista não tem nada daquele tipo: com os dois somados
 * sem regra, quem cadastrou o mesmo número nos dois lugares o veria duas vezes.
 */
function renderCompanyFooter(input: {
  readonly brand: CodeEmailBrand
  readonly brandName: string
  readonly legal: CodeEmailLegalIdentification | undefined
}): string {
  const lines = [
    `<strong style="color:${EMAIL_PALETTE.text}">${escapeHtml(input.brandName)}</strong>`,
    ...(input.legal === undefined || input.legal.legalName === input.brandName
      ? []
      : [escapeHtml(input.legal.legalName)]),
    ...(input.legal === undefined ? [] : [`CNPJ ${escapeHtml(formatTaxId(input.legal.taxId))}`]),
    ...(input.legal === undefined ? [] : [renderAddress(input.legal)]),
    ...renderContactLines(input.brand, input.legal),
  ]
  const social = renderSocialLinks(input.brand.socialLinks)

  return [
    `<tr><td style="padding:16px 24px;border-top:1px solid ${EMAIL_PALETTE.border};color:${EMAIL_PALETTE.muted};font-family:${EMAIL_FONTS.body};font-size:12px;line-height:1.7">`,
    lines.join('<br>'),
    social,
    '</td></tr>',
  ].join('')
}

/**
 * O endereço leva ao mapa. A URL é **derivada** do que está no cadastro, nunca guardada: endereço
 * corrigido com link salvo é link que aponta para o lugar errado sem ninguém perceber.
 */
function renderAddress(legal: CodeEmailLegalIdentification): string {
  const lines = toAddressLines(legal)
  const query = encodeURIComponent(
    [legal.street, legal.number, legal.district, legal.city, legal.state, legal.postalCode]
      .filter((part) => part !== '')
      .join(', '),
  )

  return `<a href="${MAPS_SEARCH_URL}${query}" style="color:${EMAIL_PALETTE.muted}">${lines
    .map((line) => escapeHtml(line))
    .join('<br>')}</a>`
}

function renderContactLines(
  brand: CodeEmailBrand,
  legal: CodeEmailLegalIdentification | undefined,
): readonly string[] {
  const phones = brand.contacts.filter((contact) => contact.kind === 'phone')
  const emails = brand.contacts.filter((contact) => contact.kind === 'email')
  const fallbackPhone = brand.contactPhone ?? legal?.phone
  const fallbackEmail = brand.contactEmail ?? legal?.email

  return [
    ...(phones.length > 0
      ? phones.map((contact) => renderPhone(contact))
      : fallbackPhone === undefined || fallbackPhone === ''
        ? []
        : [renderPhone({ isWhatsapp: false, kind: 'phone', label: '', value: fallbackPhone })]),
    ...(emails.length > 0
      ? emails.map((contact) => renderEmail(contact))
      : fallbackEmail === undefined || fallbackEmail === ''
        ? []
        : [renderEmail({ isWhatsapp: false, kind: 'email', label: '', value: fallbackEmail })]),
  ]
}

/** O rótulo primeiro, o número clicável, e o WhatsApp ao lado — não no lugar do `tel:`. */
function renderPhone(contact: CodeEmailContact): string {
  const digits = contact.value.replaceAll(/\D/gu, '')
  const label = contact.label === '' ? '' : `${escapeHtml(contact.label)}: `
  const whatsapp =
    contact.isWhatsapp && digits !== ''
      ? ` <a href="${WHATSAPP_URL}${digits}" style="color:${EMAIL_PALETTE.accent}">WhatsApp</a>`
      : ''

  return `${label}<a href="tel:+${digits}" style="color:${EMAIL_PALETTE.muted}">${escapeHtml(
    formatPhone(contact.value),
  )}</a>${whatsapp}`
}

function renderEmail(contact: CodeEmailContact): string {
  const label = contact.label === '' ? '' : `${escapeHtml(contact.label)}: `
  return `${label}<a href="mailto:${escapeHtml(contact.value)}" style="color:${EMAIL_PALETTE.muted}">${escapeHtml(contact.value)}</a>`
}

/** Redes numa linha só, separadas por ponto — a lista é curta e não merece uma linha cada. */
function renderSocialLinks(links: readonly CodeEmailSocialLink[]): string {
  if (links.length === 0) return ''

  const rendered = links
    .map(
      (link) =>
        `<a href="${escapeHtml(link.url)}" style="color:${EMAIL_PALETTE.accent}">${escapeHtml(
          toSocialLabel(link.network),
        )}</a>`,
    )
    .join(' · ')

  return `<div style="margin-top:10px">${rendered}</div>`
}

const SOCIAL_LABELS: Readonly<Record<string, string>> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  website: 'Site',
  x: 'X',
  youtube: 'YouTube',
}

/** Rede desconhecida sai com o nome que veio: catálogo novo no cadastro não some do rodapé. */
function toSocialLabel(network: string): string {
  return SOCIAL_LABELS[network] ?? network
}

/**
 * Máscara brasileira por comprimento: dez ou onze dígitos com DDD, e treze com o DDI colado. Número
 * fora dessas medidas sai como veio — melhor cru do que mascarado errado.
 */
function formatPhone(value: string): string {
  const digits = value.replaceAll(/\D/gu, '')
  const local = digits.length === 12 || digits.length === 13 ? digits.slice(2) : digits
  if (local.length !== 10 && local.length !== 11) return value

  const area = local.slice(0, 2)
  const prefix = local.slice(2, local.length - 4)
  const suffix = local.slice(-4)
  return `(${area}) ${prefix}-${suffix}`
}

/**
 * O rodapé é do produto: a marca do TransportAdA embaixo, e a assinatura da Ada Technology com link
 * para o site. É o único lugar onde quem recebe não tem a aplicação aberta para saber de quem é o
 * sistema — e por isso o nome dos dois vai escrito, não só desenhado.
 */
function renderProductFooter(input: {
  readonly appBaseUrl: string | undefined
  readonly year: number
}): string {
  const baseUrl = input.appBaseUrl === undefined ? undefined : trimTrailingSlash(input.appBaseUrl)
  const productMark =
    baseUrl === undefined
      ? ''
      : `<img src="${escapeHtml(`${baseUrl}${PRODUCT_MARK_PATH}`)}" alt="" height="28" style="display:block;margin:0 auto 8px;max-height:28px;border:0">`
  const adaMark =
    baseUrl === undefined
      ? ''
      : `<img src="${escapeHtml(`${baseUrl}${ADA_MARK_PATH}`)}" alt="" height="12" style="vertical-align:middle;margin-right:6px;border:0">`

  return [
    `<tr><td align="center" style="padding:16px 24px 22px;border-top:1px solid ${EMAIL_PALETTE.border}">`,
    productMark,
    `<span style="display:block;margin-bottom:6px;color:${EMAIL_PALETTE.text};font-family:${EMAIL_FONTS.body};font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">${PRODUCT_NAME}</span>`,
    `<span style="color:${EMAIL_PALETTE.muted};font-family:${EMAIL_FONTS.body};font-size:11px">`,
    adaMark,
    `<span style="vertical-align:middle;font-family:${EMAIL_FONTS.body}">© ${input.year} <a href="${COPYRIGHT_HOLDER_URL}" style="color:${EMAIL_PALETTE.muted}">${COPYRIGHT_HOLDER}</a></span>`,
    '</span>',
    '</td></tr>',
  ].join('')
}
