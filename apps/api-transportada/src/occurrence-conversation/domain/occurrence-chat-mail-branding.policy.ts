/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O chat da contratante renderiza pelo modelo padrão do módulo de notificação, que só aceita texto no rodapé
 * (`rodapePlataforma`) e põe as miniaturas numa linha própria. Para as marcas ficarem ao lado do nome de cada uma,
 * como no desenho aprovado, a API entrega uma marca de posição no lugar do texto e troca por aqui, depois do render —
 * funciona com o modelo embutido e com o da empresa, que só precisam manter a variável. Pura.
 */
export const CHAT_MAIL_FOOTER_PLACEHOLDER = '__ADA_PLATFORM_FOOTER__'

const LOGO_CID_SRC = 'src="cid:company-logo"'
const FIXED_WIDTH_ATTR = 'width="620"'
const FIXED_WIDTH_STYLE = /(?<!max-)width:\s*620px/g
const EMPTY_ROW = /<tr>\s*<td style="[^"]*">\s*<\/td>\s*<\/tr>/g

/** Largura fluida (máx. 620) e sem linhas vazias: o modelo padrão fixa 620px, que não cabe no celular. */
function makeFluid(html: string): string {
  return html
    .replaceAll(FIXED_WIDTH_ATTR, 'width="100%"')
    .replace(FIXED_WIDTH_STYLE, 'width:100%')
    .replace(EMPTY_ROW, '')
}

export function brandChatMail(params: {
  /** O HTML do rodapé (miniaturas ao lado dos nomes), já escapado. */
  readonly footerHtml: string
  readonly footerText: string
  readonly html: string
  /** O logo por endereço público; ausente, o `cid:` do render fica como está. */
  readonly logoUrl?: string | undefined
  readonly text: string
}): { readonly html: string; readonly text: string } {
  const html = makeFluid(params.html.replaceAll(CHAT_MAIL_FOOTER_PLACEHOLDER, params.footerHtml))
  return {
    html:
      params.logoUrl === undefined
        ? html
        : html.replaceAll(LOGO_CID_SRC, `src="${params.logoUrl.replaceAll('"', '&quot;')}"`),
    text: params.text.replaceAll(CHAT_MAIL_FOOTER_PLACEHOLDER, params.footerText),
  }
}
