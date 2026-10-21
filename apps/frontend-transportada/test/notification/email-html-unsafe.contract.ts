/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 272 T4.1 (ADR-0110 §2): o validador do painel aplica a MESMA tabela inteira que a API. A tabela é cópia por
 * valor (`emailHtmlUnsafeCases.constant.ts`); o caminho relativo até a API só aparece aqui, para conferir os nomes,
 * nunca como `import` de código.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  EMAIL_HTML_PROBLEM,
  findUnsafeHtmlRules,
  validateEmailHtml,
} from '../../src/modules/notification/shared/emailHtml.validation'
import { OCCURRENCE_MAIL_UNSAFE_HTML_CASES } from '../../src/modules/notification/shared/emailHtmlUnsafeCases.constant'

const API_POLICY_SOURCE = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/occurrence-mail-html-safety.policy.ts',
  import.meta.url,
)

const RULE_CODE = {
  event: EMAIL_HTML_PROBLEM.UNSAFE_EVENT,
  placeholder_in_tag: EMAIL_HTML_PROBLEM.PLACEHOLDER_IN_TAG,
  scheme: EMAIL_HTML_PROBLEM.UNSAFE_SCHEME,
  tag: EMAIL_HTML_PROBLEM.UNSAFE_TAG,
} as const
/** `<script` já tinha o código próprio antes da spec 272; as outras tags ganharam `UNSAFE_TAG`. */
const UNSAFE_CODES: readonly string[] = [...Object.values(RULE_CODE), EMAIL_HTML_PROBLEM.SCRIPT]

function expectedCodesOf(entry: { html: string; rules: readonly (keyof typeof RULE_CODE)[] }) {
  return entry.rules.flatMap((rule) =>
    rule === 'tag' && /<script\b/iu.test(entry.html)
      ? [
          EMAIL_HTML_PROBLEM.SCRIPT,
          ...(/<(?:iframe|form|object|embed)\b/iu.test(entry.html) ? [RULE_CODE.tag] : []),
        ]
      : [RULE_CODE[rule]],
  )
}

/** As regras novas valem no modelo do e-mail da ocorrência, que se reconhece pela área de mensagem (ADR-0110 §12). */
function asOccurrenceModel(html: string): string {
  return `<!-- mensagem -->x<!-- /mensagem -->${html}`
}

function unsafeCodesOf(html: string): readonly string[] {
  return validateEmailHtml(asOccurrenceModel(html))
    .problems.filter((problem) => UNSAFE_CODES.includes(problem.code))
    .map((problem) => problem.code)
}

describe('a tabela de HTML inseguro do painel é a da API', () => {
  test('tem os 46 casos e os mesmos nomes, na mesma ordem, do arquivo-fonte da API', () => {
    const source = readFileSync(API_POLICY_SOURCE, 'utf8')
    const table = source.slice(source.indexOf('export const OCCURRENCE_MAIL_UNSAFE_HTML_CASES'))
    const apiNames = [...table.matchAll(/\bname: '([^']*)'/gu)].map((match) => match[1] ?? '')

    expect(OCCURRENCE_MAIL_UNSAFE_HTML_CASES).toHaveLength(46)
    expect(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.map((entry) => entry.name)).toEqual(apiNames)
  })
})

describe('os mesmos casos dão o mesmo veredito da API', () => {
  test.each(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_name, entry) => {
      expect(findUnsafeHtmlRules(entry.html)).toEqual(entry.rules)
      expect([...unsafeCodesOf(entry.html)].sort()).toEqual([...expectedCodesOf(entry)].sort())
    },
  )

  test('o caso inseguro reprova como error; o seguro não ganha problema novo', () => {
    for (const entry of OCCURRENCE_MAIL_UNSAFE_HTML_CASES) {
      const report = validateEmailHtml(asOccurrenceModel(entry.html))
      const unsafe = report.problems.filter((problem) => UNSAFE_CODES.includes(problem.code))

      expect(unsafe.every((problem) => problem.severity === 'error')).toBe(true)
      if (entry.rules.length > 0) expect(report.isValid).toBe(false)
    }
  })
})

describe('só vale quando o corpo é HTML (a mesma condição da API)', () => {
  test('texto puro com "javascript:" e "onclick=" não é problema', () => {
    expect(unsafeCodesOf('Veja javascript:x e onclick=1 em {{contratante}}')).toEqual([])
  })

  test('o mesmo trecho dentro de uma tag é problema', () => {
    expect(unsafeCodesOf('<p>Veja javascript:x</p>')).toEqual([RULE_CODE.scheme])
  })
})

describe('só vale no modelo do e-mail da ocorrência (o editor de Notificações serve a todos os modelos)', () => {
  test('modelo de outra notificação, sem a área de mensagem, com link `{{url}}` não ganha problema novo', () => {
    const report = validateEmailHtml(
      '<p><a href="{{url}}">Abrir</a> <span onclick="x">t</span></p>',
    )

    expect(report.problems.filter((problem) => UNSAFE_CODES.includes(problem.code))).toEqual([])
  })

  test('o `<script` segue recusado em qualquer modelo, como antes da spec 272', () => {
    expect(validateEmailHtml('<p>a</p><script>x</script>').isValid).toBe(false)
  })
})
