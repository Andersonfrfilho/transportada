/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A moldura HTML dos e-mails do produto.
 *
 * Mora no worker, que é quem envia, e não num pacote: a marca é deste produto, e esta app não
 * importa código de nenhuma outra (`code-standart.md` §2). O painel não precisa da mesma função —
 * ele valida o HTML do template, que é outra coisa, e o preview dele desenha o aparelho de quem
 * recebe, não a nossa moldura.
 *
 * As restrições explicam o código feio: tabela em vez de flex, estilo em atributo em vez de classe,
 * e nenhum asset externo. Cliente de e-mail não é navegador — o Outlook desenha com o motor do
 * Word, o Gmail remove `<style>` no encaminhamento, e imagem remota chega bloqueada por padrão. Por
 * isso a marca é tipografia, não arquivo.
 *
 * ⚠️ As cores são literais **de propósito**: elas são cópia por valor dos tokens de
 * `frontend-transportada/src/styles/index.css`, porque o e-mail não carrega o nosso CSS e o worker
 * não importa código do frontend. Mudou a paleta lá? mude aqui — `test/identity/email-layout.contract.ts`
 * é o que lembra.
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

export type BuildEmailHtmlParams = {
  readonly body: string
  readonly subject: string
}

/**
 * Entidade HTML no lugar do caractere. O corpo vem do template, que hoje é editável no painel — sem
 * escapar, um `<` digitado por quem escreve o texto quebra o documento inteiro, e uma tag colada de
 * outro lugar entra no e-mail de todo mundo.
 */
function escapeHtml(value: string): string {
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

export function buildEmailHtml({ body, subject }: BuildEmailHtmlParams): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    `<title>${escapeHtml(subject)}</title>`,
    '</head>',
    `<body style="margin:0;padding:24px 0;background:${EMAIL_PALETTE.background}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_PALETTE.background}">`,
    '<tr><td align="center">',
    `<table role="presentation" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_MAX_WIDTH}px;background:${EMAIL_PALETTE.surface};border:1px solid ${EMAIL_PALETTE.border}">`,
    `<tr><td style="padding:24px 24px 8px"><span style="color:${EMAIL_PALETTE.accent};font-size:13px;letter-spacing:.08em;text-transform:uppercase">TransportAdA</span></td></tr>`,
    `<tr><td style="padding:0 24px 24px">${toParagraphs(body)}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${EMAIL_PALETTE.border};color:${EMAIL_PALETTE.muted};font-size:12px">Mensagem automática — não responda este e-mail.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('')
}
