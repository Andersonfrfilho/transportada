/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.2 (ADR-0110 §2, D2): HTML inseguro é "não utilizável". A tabela de casos é a mesma que o painel
 * (inteira) e o worker (filtro grosso, coluna `worker`) copiam.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_MAIL_UNSAFE_HTML_CASES,
  findMessageArea,
  findUnsafeHtmlRules,
  hasSystemHtmlKeyInMessageArea,
} from '../../src/occurrence-conversation/domain/occurrence-mail-html-safety.policy.js'

describe('spec 272: tabela de casos do HTML inseguro', () => {
  test('a tabela cobre as quatro regras, safe e unsafe, com a coluna worker', () => {
    const rules = new Set(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.flatMap((row) => row.rules))

    expect([...rules].sort()).toEqual(['event', 'placeholder_in_tag', 'scheme', 'tag'])
    expect(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.some((row) => row.rules.length === 0)).toBe(true)
    expect(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.length).toBeGreaterThanOrEqual(30)
    for (const row of OCCURRENCE_MAIL_UNSAFE_HTML_CASES) {
      expect(['bloqueia', 'deixa para a API']).toContain(row.worker)
    }
  })

  test.each(OCCURRENCE_MAIL_UNSAFE_HTML_CASES.map((row) => [row.name, row] as const))(
    '%s',
    (_name, row) => {
      expect([...findUnsafeHtmlRules(row.html)].sort()).toEqual([...row.rules].sort())
    },
  )

  test('o worker nunca é mais estrito que a API: quem ele bloqueia a API também bloqueia', () => {
    for (const row of OCCURRENCE_MAIL_UNSAFE_HTML_CASES) {
      if (row.worker === 'bloqueia') expect(row.rules.length).toBeGreaterThan(0)
    }
  })

  test('casos fixados à mão, independentes da tabela', () => {
    expect(findUnsafeHtmlRules('<SCRIPT>x</SCRIPT>')).toEqual(['tag'])
    expect(findUnsafeHtmlRules('<a href="JaVa&#x73;cript&colon;x">')).toEqual(['scheme'])
    expect(findUnsafeHtmlRules('<a href="{{valor}}">')).toEqual(['placeholder_in_tag'])
    expect(findUnsafeHtmlRules('<p style="color:red">{{valor}}</p>')).toEqual([])
  })
})

describe('spec 272: a área de mensagem (D12)', () => {
  const OPEN = '<!-- mensagem -->'
  const CLOSE = '<!-- /mensagem -->'

  test('um par em ordem: devolve a área', () => {
    const html = `<p>a</p>${OPEN}<p>Olá</p>${CLOSE}<p>b</p>`
    const area = findMessageArea(html)

    expect(area).toBeDefined()
    expect(html.slice(area!.contentStart, area!.contentEnd)).toBe('<p>Olá</p>')
    expect(html.slice(area!.start, area!.end)).toBe(`${OPEN}<p>Olá</p>${CLOSE}`)
  })

  test('ausente, só a abertura, só o fechamento, invertido, duplicado: sem área', () => {
    for (const html of [
      '<p>nada</p>',
      `${OPEN}<p>x</p>`,
      `<p>x</p>${CLOSE}`,
      `${CLOSE}<p>x</p>${OPEN}`,
      `${OPEN}a${CLOSE}${OPEN}b${CLOSE}`,
      `${OPEN}${OPEN}a${CLOSE}`,
    ]) {
      expect(findMessageArea(html)).toBeUndefined()
    }
  })

  test('chave de HTML do sistema dentro da área é problema; fora, não', () => {
    for (const key of ['logoTransportadora', 'tabelaItens', 'marcasRodape', 'faixaResposta']) {
      expect(hasSystemHtmlKeyInMessageArea(`${OPEN}<p>{{ ${key} }}</p>${CLOSE}`)).toBe(true)
      expect(hasSystemHtmlKeyInMessageArea(`{{${key}}}${OPEN}<p>x</p>${CLOSE}`)).toBe(false)
    }
    expect(hasSystemHtmlKeyInMessageArea(`${OPEN}<p>{{contratante}}</p>${CLOSE}`)).toBe(false)
    expect(hasSystemHtmlKeyInMessageArea('<p>{{tabelaItens}}</p>')).toBe(false)
  })
})
