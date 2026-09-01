/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Confere o HTML do template contra o que cliente de e-mail **realmente faz**.
 *
 * Não é validação de HTML: um documento pode ser perfeitamente válido e ainda assim chegar
 * quebrado. O Outlook desenha com o motor do Word e ignora flex e grid; o Gmail remove `<style>`
 * no encaminhamento e corta a mensagem acima de 102 KB; imagem remota chega bloqueada por padrão e
 * imagem em `data:` é descartada pela maioria. O que se mede aqui é a distância entre "HTML
 * correto" e "HTML que sobrevive à entrega" — e essa distância só aparece na caixa de quem recebeu,
 * tarde demais para consertar.
 *
 * `error` reprova; `warning` degrada sem impedir. A tela desenha os dois, e quem escreve decide.
 */
export const EMAIL_HTML_PROBLEM = {
  DATA_URI_IMAGE: 'EMAIL_HTML_DATA_URI_IMAGE',
  EXTERNAL_STYLESHEET: 'EMAIL_HTML_EXTERNAL_STYLESHEET',
  GMAIL_CLIP: 'EMAIL_HTML_GMAIL_CLIP',
  IMAGE_WITHOUT_ALT: 'EMAIL_HTML_IMAGE_WITHOUT_ALT',
  MODERN_LAYOUT: 'EMAIL_HTML_MODERN_LAYOUT',
  RELATIVE_URL: 'EMAIL_HTML_RELATIVE_URL',
  SCRIPT: 'EMAIL_HTML_SCRIPT',
  UNBALANCED_TAGS: 'EMAIL_HTML_UNBALANCED_TAGS',
} as const

/** Acima disto o Gmail corta a mensagem e esconde o fim atrás de "ver mensagem inteira". */
export const EMAIL_GMAIL_CLIP_BYTES = 102_400

export type EmailHtmlSeverity = 'error' | 'warning'

export type EmailHtmlProblem = {
  readonly code: string
  readonly message: string
  readonly severity: EmailHtmlSeverity
}

export type EmailHtmlReport = {
  readonly isValid: boolean
  readonly problems: readonly EmailHtmlProblem[]
}

type Rule = {
  readonly code: string
  readonly detect: (html: string) => boolean
  readonly message: string
  readonly severity: EmailHtmlSeverity
}

const SCRIPT_PATTERN = /<script\b/iu
const EXTERNAL_STYLESHEET_PATTERN = /<link\b[^>]*rel\s*=\s*["']?stylesheet/iu
const DATA_URI_IMAGE_PATTERN = /<img\b[^>]*src\s*=\s*["']?data:/iu
const IMAGE_PATTERN = /<img\b[^>]*>/giu
const ALT_PATTERN = /\balt\s*=/iu
const RELATIVE_URL_PATTERN = /(?:href|src)\s*=\s*["'](?!https?:|mailto:|tel:|data:|#)[^"']+["']/iu
const MODERN_LAYOUT_PATTERN = /display\s*:\s*(?:flex|grid)|\bposition\s*:\s*(?:absolute|fixed)/iu

/** Só o que fecha errado importa; comparar a contagem de abre e fecha basta para o caso comum. */
function hasUnbalancedTags(html: string): boolean {
  const opening = (
    html.match(/<(?!\/)(?!area|base|br|col|hr|img|input|link|meta)[a-z][^>]*>/giu) ?? []
  ).filter((tag) => !tag.endsWith('/>')).length
  const closing = (html.match(/<\/[a-z][^>]*>/giu) ?? []).length

  return opening !== closing
}

const RULES: readonly Rule[] = [
  {
    code: EMAIL_HTML_PROBLEM.SCRIPT,
    detect: (html) => SCRIPT_PATTERN.test(html),
    message: 'Script é removido por todo cliente de e-mail — o que ele faria não acontece.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.EXTERNAL_STYLESHEET,
    detect: (html) => EXTERNAL_STYLESHEET_PATTERN.test(html),
    message: 'Folha de estilo externa não é buscada: use estilo em atributo `style`.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.DATA_URI_IMAGE,
    detect: (html) => DATA_URI_IMAGE_PATTERN.test(html),
    message: 'Imagem embutida em `data:` é descartada pela maioria dos clientes.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.UNBALANCED_TAGS,
    detect: hasUnbalancedTags,
    message: 'Há tag aberta sem fechar: o cliente conserta do jeito dele, e o layout quebra.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.MODERN_LAYOUT,
    detect: (html) => MODERN_LAYOUT_PATTERN.test(html),
    message: 'Flex, grid e posicionamento são ignorados pelo Outlook: use tabela.',
    severity: 'warning',
  },
  {
    code: EMAIL_HTML_PROBLEM.RELATIVE_URL,
    detect: (html) => RELATIVE_URL_PATTERN.test(html),
    message: 'Endereço relativo não resolve fora do site: use a URL inteira.',
    severity: 'warning',
  },
  {
    code: EMAIL_HTML_PROBLEM.IMAGE_WITHOUT_ALT,
    detect: (html) => (html.match(IMAGE_PATTERN) ?? []).some((image) => !ALT_PATTERN.test(image)),
    message: 'Imagem sem `alt` some quando o cliente bloqueia imagem — e ele bloqueia por padrão.',
    severity: 'warning',
  },
  {
    code: EMAIL_HTML_PROBLEM.GMAIL_CLIP,
    detect: (html) => new TextEncoder().encode(html).byteLength > EMAIL_GMAIL_CLIP_BYTES,
    message: 'Acima de 102 KB o Gmail corta a mensagem e esconde o fim.',
    severity: 'warning',
  },
]

export function validateEmailHtml(html: string): EmailHtmlReport {
  const problems = RULES.filter((rule) => rule.detect(html)).map((rule) => ({
    code: rule.code,
    message: rule.message,
    severity: rule.severity,
  }))

  return { isValid: !problems.some((problem) => problem.severity === 'error'), problems }
}
