/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { UnsafeHtmlRule } from './emailHtmlUnsafeCases.constant'

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
  PLACEHOLDER_IN_TAG: 'EMAIL_HTML_PLACEHOLDER_IN_TAG',
  RELATIVE_URL: 'EMAIL_HTML_RELATIVE_URL',
  SCRIPT: 'EMAIL_HTML_SCRIPT',
  UNBALANCED_TAGS: 'EMAIL_HTML_UNBALANCED_TAGS',
  UNSAFE_EVENT: 'EMAIL_HTML_UNSAFE_EVENT',
  UNSAFE_SCHEME: 'EMAIL_HTML_UNSAFE_SCHEME',
  UNSAFE_TAG: 'EMAIL_HTML_UNSAFE_TAG',
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

/**
 * Spec 272 (ADR-0110 §2): conteúdo ativo no HTML do e-mail da ocorrência. Cópia por valor de
 * `occurrence-mail-html-safety.policy.ts` da API (o painel não importa código da API); a tabela de casos
 * (`emailHtmlUnsafeCases.constant.ts`) e `test/notification/email-html-unsafe.contract.ts` prendem a paridade.
 */
const UNSAFE_TAG_PATTERN = /<(?:script|iframe|form|object|embed)\b/iu
const UNSAFE_OTHER_TAG_PATTERN = /<(?:iframe|form|object|embed)\b/iu
const UNSAFE_EVENT_PATTERN = /[\s/"']on[a-z]+\s*=/iu
const UNSAFE_SCHEME_PATTERN = /(?:javascript|vbscript):/iu
const PLACEHOLDER_IN_TAG_PATTERN =
  /<[a-zA-Z/!](?:[^>"']|"[^"]*"|'[^']*')*(?:\{\{|"[^"]*\{\{|'[^']*\{\{)/u
const PLACEHOLDER_IN_STYLE_PATTERN = /<style\b(?:(?!<\/style\b)[\s\S])*?\{\{/iu
// eslint-disable-next-line no-control-regex -- ADR-0110 §2: exatamente `[\u0000- ]` (controles e espaço)
const CONTROL_AND_SPACE_PATTERN = /[\u0000- ]/gu
const NUMERIC_ENTITY_PATTERN = /&#(?:x([0-9a-f]+)|([0-9]+));?/giu
const NAMED_ENTITY_PATTERN = /&(colon|tab|newline);/giu
const NAMED_ENTITY_VALUE: Readonly<Record<string, string>> = {
  colon: ':',
  newline: '\n',
  tab: '\t',
}
const MAX_CODE_POINT = 0x10ffff
/** A mesma condição da API (`HTML_BODY_REGEX`): as regras só valem quando o corpo é HTML. */
const HTML_BODY_PATTERN = /<\/?[A-Za-z][A-Za-z0-9_:-]*[\s>/]/u

function decodeCodePoint(code: number): string {
  return Number.isFinite(code) && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : ''
}

function normalizeForScheme(html: string): string {
  return html
    .replace(
      NUMERIC_ENTITY_PATTERN,
      (_entity, hex: string | undefined, decimal: string | undefined) =>
        decodeCodePoint(
          hex === undefined ? Number.parseInt(decimal ?? '', 10) : Number.parseInt(hex, 16),
        ),
    )
    .replace(
      NAMED_ENTITY_PATTERN,
      (_entity, name: string) => NAMED_ENTITY_VALUE[name.toLowerCase()] ?? '',
    )
    .replace(CONTROL_AND_SPACE_PATTERN, '')
}

/** As regras da API aplicadas ao HTML, na mesma ordem dela. Sem condição de HTML: quem chama decide. */
export function findUnsafeHtmlRules(html: string): readonly UnsafeHtmlRule[] {
  return [
    ...(UNSAFE_TAG_PATTERN.test(html) ? (['tag'] as const) : []),
    ...(UNSAFE_EVENT_PATTERN.test(html) ? (['event'] as const) : []),
    ...(UNSAFE_SCHEME_PATTERN.test(normalizeForScheme(html)) ? (['scheme'] as const) : []),
    ...(PLACEHOLDER_IN_TAG_PATTERN.test(html) || PLACEHOLDER_IN_STYLE_PATTERN.test(html)
      ? (['placeholder_in_tag'] as const)
      : []),
  ]
}

/**
 * O editor de Notificações serve a todos os modelos; as regras da spec 272 são do modelo do e-mail da ocorrência,
 * que se reconhece pela área de mensagem (ADR-0110 §12). Um link `href="{{url}}"` de outra notificação segue válido.
 */
const OCCURRENCE_MAIL_AREA_PATTERN = /<!--\s*mensagem\s*-->/u

function hasUnsafeRule(html: string, rule: UnsafeHtmlRule): boolean {
  return (
    OCCURRENCE_MAIL_AREA_PATTERN.test(html) &&
    HTML_BODY_PATTERN.test(html) &&
    findUnsafeHtmlRules(html).includes(rule)
  )
}

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
    // O `<script` já tem o aviso acima; este cobre as outras tags que a API recusa.
    code: EMAIL_HTML_PROBLEM.UNSAFE_TAG,
    detect: (html) => hasUnsafeRule(html, 'tag') && UNSAFE_OTHER_TAG_PATTERN.test(html),
    message:
      'iframe, form, object e embed não funcionam em e-mail e o modelo não é aceito com eles.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.UNSAFE_EVENT,
    detect: (html) => hasUnsafeRule(html, 'event'),
    message:
      'Atributo de evento (onclick, onerror…) é conteúdo ativo e o modelo não é aceito. Se for só texto com "on…=", reescreva.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.UNSAFE_SCHEME,
    detect: (html) => hasUnsafeRule(html, 'scheme'),
    message: 'Endereço `javascript:` ou `vbscript:` é conteúdo ativo e o modelo não é aceito.',
    severity: 'error',
  },
  {
    code: EMAIL_HTML_PROBLEM.PLACEHOLDER_IN_TAG,
    detect: (html) => hasUnsafeRule(html, 'placeholder_in_tag'),
    message:
      'Variável `{{ }}` dentro de uma tag (href, src, style) deixaria um valor externo virar endereço: use-a só no texto.',
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
