/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §2, D2): HTML inseguro é "não utilizável". Bloqueio de conteúdo ativo, não um sanitizador:
 * o autor do modelo é usuário interno. Pura. A tabela `OCCURRENCE_MAIL_UNSAFE_HTML_CASES` é dado puro e o
 * arquivo-fonte copiado por valor pelo painel (inteira) e pelo worker (filtro grosso, coluna `worker`).
 */
import {
  OCCURRENCE_MAIL_MESSAGE_AREA,
  OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
} from './occurrence-contractor-mail.constant.js'

export type UnsafeHtmlRule = 'event' | 'placeholder_in_tag' | 'scheme' | 'tag'

const TAG_REGEX = /<(?:script|iframe|form|object|embed)\b/iu
const EVENT_REGEX = /[\s/"']on[a-z]+\s*=/iu
const SCHEME_REGEX = /(?:javascript|vbscript):/iu
/**
 * `{{` dentro de uma tag aberta: atributos entre aspas podem conter `>` e o `{{` pode estar dentro do valor entre aspas.
 * Fora disso, `{{` dentro de `<style>…</style>` (CSS injetável).
 */
const PLACEHOLDER_IN_TAG_REGEX =
  /<[a-zA-Z/!](?:[^>"']|"[^"]*"|'[^']*')*(?:\{\{|"[^"]*\{\{|'[^']*\{\{)/u
const PLACEHOLDER_IN_STYLE_REGEX = /<style\b(?:(?!<\/style\b)[\s\S])*?\{\{/iu
// eslint-disable-next-line no-control-regex -- ADR-0110 §2: exatamente `[\u0000- ]` (controles e espaço)
const CONTROL_AND_SPACE_REGEX = /[\u0000- ]/gu
const NUMERIC_ENTITY_REGEX = /&#(?:x([0-9a-f]+)|([0-9]+));?/giu
const NAMED_ENTITY_REGEX = /&(colon|tab|newline);/giu
const NAMED_ENTITY_VALUE: Readonly<Record<string, string>> = {
  colon: ':',
  newline: '\n',
  tab: '\t',
}
const MAX_CODE_POINT = 0x10ffff

function decodeCodePoint(code: number): string {
  return Number.isFinite(code) && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : ''
}

/** A cópia em que o esquema é procurado: entidades decodificadas (uma vez) e `[\u0000- ]` removidos. */
function normalizeForScheme(html: string): string {
  return html
    .replace(
      NUMERIC_ENTITY_REGEX,
      (_entity, hex: string | undefined, decimal: string | undefined) =>
        decodeCodePoint(
          hex === undefined ? Number.parseInt(decimal ?? '', 10) : Number.parseInt(hex, 16),
        ),
    )
    .replace(
      NAMED_ENTITY_REGEX,
      (_entity, name: string) => NAMED_ENTITY_VALUE[name.toLowerCase()] ?? '',
    )
    .replace(CONTROL_AND_SPACE_REGEX, '')
}

export function findUnsafeHtmlRules(html: string): readonly UnsafeHtmlRule[] {
  return [
    ...(TAG_REGEX.test(html) ? (['tag'] as const) : []),
    ...(EVENT_REGEX.test(html) ? (['event'] as const) : []),
    ...(SCHEME_REGEX.test(normalizeForScheme(html)) ? (['scheme'] as const) : []),
    ...(PLACEHOLDER_IN_TAG_REGEX.test(html) || PLACEHOLDER_IN_STYLE_REGEX.test(html)
      ? (['placeholder_in_tag'] as const)
      : []),
  ]
}

export type MessageArea = {
  /** Fim do par (depois do comentário de fechamento) e início do par, no HTML inteiro. */
  readonly end: number
  readonly start: number
  /** O que fica entre os dois comentários. */
  readonly contentEnd: number
  readonly contentStart: number
}

const AREA_OPEN_REGEX = new RegExp(escapeRegex(OCCURRENCE_MAIL_MESSAGE_AREA.open), 'gu')
const AREA_CLOSE_REGEX = new RegExp(escapeRegex(OCCURRENCE_MAIL_MESSAGE_AREA.close), 'gu')

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** `undefined` quando o par está ausente, duplicado, desbalanceado ou invertido. */
export function findMessageArea(html: string): MessageArea | undefined {
  const opens = [...html.matchAll(AREA_OPEN_REGEX)]
  const closes = [...html.matchAll(AREA_CLOSE_REGEX)]
  const open = opens[0]
  const close = closes[0]
  if (opens.length !== 1 || closes.length !== 1 || open === undefined || close === undefined) {
    return undefined
  }
  const contentStart = open.index + open[0].length
  if (close.index < contentStart) return undefined
  return {
    contentEnd: close.index,
    contentStart,
    end: close.index + close[0].length,
    start: open.index,
  }
}

const SYSTEM_HTML_KEY_REGEX = new RegExp(
  `\\{\\{\\s*(?:${OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES.join('|')})\\s*\\}\\}`,
  'u',
)

/** Chave de HTML do sistema dentro da área do operador: regra, não convenção (o texto dele a apagaria). */
export function hasSystemHtmlKeyInMessageArea(html: string): boolean {
  const area = findMessageArea(html)
  return (
    area !== undefined && SYSTEM_HTML_KEY_REGEX.test(html.slice(area.contentStart, area.contentEnd))
  )
}

export type UnsafeHtmlCase = {
  readonly html: string
  readonly name: string
  /** As regras que a API aplica; vazio é HTML seguro. */
  readonly rules: readonly UnsafeHtmlRule[]
  /** O filtro grosso do worker: `bloqueia` ou `deixa para a API` (nunca mais estrito que a API). */
  readonly worker: 'bloqueia' | 'deixa para a API'
}

export const OCCURRENCE_MAIL_UNSAFE_HTML_CASES: readonly UnsafeHtmlCase[] = [
  { html: '<script>alert(1)</script>', name: 'tag: script', rules: ['tag'], worker: 'bloqueia' },
  {
    html: '<SCRIPT SRC=x></SCRIPT>',
    name: 'tag: SCRIPT em maiúsculas',
    rules: ['tag'],
    worker: 'bloqueia',
  },
  {
    html: '<script\n>x</script>',
    name: 'tag: script com quebra de linha',
    rules: ['tag'],
    worker: 'bloqueia',
  },
  {
    html: '<iframe src="//example.test/"></iframe>',
    name: 'tag: iframe',
    rules: ['tag'],
    worker: 'bloqueia',
  },
  {
    html: '<form action="//example.test/"><input></form>',
    name: 'tag: form',
    rules: ['tag'],
    worker: 'bloqueia',
  },
  { html: '<object data="x"></object>', name: 'tag: object', rules: ['tag'], worker: 'bloqueia' },
  { html: '<embed src="x">', name: 'tag: embed', rules: ['tag'], worker: 'bloqueia' },
  {
    html: '<scripts>x</scripts>',
    name: 'tag: nome que só começa com script é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<formal>x</formal>',
    name: 'tag: nome que só começa com form é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="#" onclick="x()">a</a>',
    name: 'evento: onclick',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<img src=x onerror=alert(1)>',
    name: 'evento: onerror sem aspas',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<body ONLOAD = "x()">',
    name: 'evento: ONLOAD em maiúsculas com espaços',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<a/onclick=x>',
    name: 'evento: barra antes do nome',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<p title="a"onmouseover=x>',
    name: 'evento: logo após aspas',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<p>O cliente ficou online = sim</p>',
    name: 'evento: falso positivo em texto é aceito',
    rules: ['event'],
    worker: 'bloqueia',
  },
  {
    html: '<p>position=1, conta=3 e on=1</p>',
    name: 'evento: "on" no meio de palavra ou sem letras depois é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="javascript:alert(1)">a</a>',
    name: 'esquema: javascript:',
    rules: ['scheme'],
    worker: 'bloqueia',
  },
  {
    html: '<a href="JaVaScRiPt:alert(1)">a</a>',
    name: 'esquema: maiúsculas e minúsculas',
    rules: ['scheme'],
    worker: 'bloqueia',
  },
  {
    html: '<a href="vbscript:x">a</a>',
    name: 'esquema: vbscript:',
    rules: ['scheme'],
    worker: 'bloqueia',
  },
  {
    html: '<a href="java&#115;cript:alert(1)">a</a>',
    name: 'esquema: entidade decimal com ponto e vírgula',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="java&#115cript:alert(1)">a</a>',
    name: 'esquema: entidade decimal sem ponto e vírgula',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="java&#x73;cript:alert(1)">a</a>',
    name: 'esquema: entidade hexadecimal',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="javascript&colon;alert(1)">a</a>',
    name: 'esquema: &colon;',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="java&Tab;script:alert(1)">a</a>',
    name: 'esquema: &Tab; no meio',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="java&NewLine;script:alert(1)">a</a>',
    name: 'esquema: &NewLine; no meio',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="java\tscript:alert(1)">a</a>',
    name: 'esquema: tabulação no meio',
    rules: ['scheme'],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="  javascript:alert(1)">a</a>',
    name: 'esquema: espaços antes',
    rules: ['scheme'],
    worker: 'bloqueia',
  },
  {
    html: '<a href="/docs/javascript">a</a>',
    name: 'esquema: a palavra sem os dois pontos é segura',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<a href="{{contratante}}">a</a>',
    name: 'placeholder em tag: href',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<img src={{logoTransportadora}} alt="">',
    name: 'placeholder em tag: src sem aspas',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<p style="color:{{cor}}">a</p>',
    name: 'placeholder em tag: style',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<a title=">" href="{{contratante}}">a</a>',
    name: 'placeholder em tag: href depois de aspas com >',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: "<p title='>' style='{{cor}}'>a</p>",
    name: 'placeholder em tag: aspas simples com > antes',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<a title=">{{contratante}}">a</a>',
    name: 'placeholder em tag: dentro de valor entre aspas, depois de >',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<style>p{color:{{cor}}}</style>',
    name: 'placeholder em tag: dentro de style',
    rules: ['placeholder_in_tag'],
    worker: 'bloqueia',
  },
  {
    html: '<style type="text/css">p{color:red}</style><p>{{contratante}}</p>',
    name: 'placeholder depois de style é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<p title="a>b">{{contratante}}</p>',
    name: 'placeholder fora de tag com > em atributo é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: "<p>a > b e don't</p><p>{{contratante}}</p>",
    name: 'placeholder depois de > e aspas soltas no texto é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<p>{{contratante}}</p>',
    name: 'placeholder fora de tag é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<p>a</p><!-- mensagem -->{{numeroNota}}<!-- /mensagem -->',
    name: 'placeholder depois de comentário é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  {
    html: '<table style="width:620px"><tr><td style="color:#10222c">Olá {{contratante}}</td></tr></table>',
    name: 'HTML do modelo: tabela com estilo inline é seguro',
    rules: [],
    worker: 'deixa para a API',
  },
  { html: '', name: 'vazio é seguro', rules: [], worker: 'deixa para a API' },
]
