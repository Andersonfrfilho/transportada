/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.2 (ADR-0110 §3, D3): renderer de uma passada; escape só nos valores.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_MAIL_HTML_MAX_BYTES,
  OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import { renderContractorMailHtml } from '../../src/occurrence-conversation/domain/occurrence-mail-html-render.policy.js'

function render(bodyTemplate: string, values: Record<string, string> = {}, systemHtml = {}) {
  return renderContractorMailHtml({ bodyTemplate, subjectTemplate: 'Assunto', systemHtml, values })
}

describe('spec 272: renderer do e-mail HTML', () => {
  test('as quatro chaves de HTML do sistema, em ordem', () => {
    expect(OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES).toEqual([
      'logoTransportadora',
      'tabelaItens',
      'marcasRodape',
      'faixaResposta',
    ])
    expect(OCCURRENCE_MAIL_HTML_MAX_BYTES).toBe(524288)
  })

  test('valor escapado, HTML do modelo intacto', () => {
    const { html } = render('<p style="color:#000">Olá {{ observacao }}!</p>', {
      observacao: '<b>x</b> & "y"',
    })

    expect(html).toBe('<p style="color:#000">Olá &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;!</p>')
  })

  test('chave raw só pelo nome: o valor do sistema entra cru, o mesmo conteúdo em values sai escapado', () => {
    const { html } = render(
      '{{tabelaItens}}|{{observacao}}',
      { observacao: '<i>a</i>', tabelaItens: '<b>do usuario</b>' },
      { tabelaItens: '<table><tr><td>ok</td></tr></table>' },
    )

    expect(html).toBe('<table><tr><td>ok</td></tr></table>|&lt;i&gt;a&lt;/i&gt;')
  })

  test('chave de HTML do sistema sem valor do sistema sai vazia, mesmo com values', () => {
    expect(render('[{{logoTransportadora}}]', { logoTransportadora: '<img>' }).html).toBe('[]')
  })

  test('valor contendo {{logoTransportadora}} não é reinterpretado', () => {
    const { html } = render(
      '<p>{{observacao}}</p>{{logoTransportadora}}',
      { observacao: '{{logoTransportadora}} {{contratante}}', contratante: 'Alfa' },
      { logoTransportadora: '<img src="cid:company-logo">' },
    )

    expect(html).toBe('<p>{{logoTransportadora}} {{contratante}}</p><img src="cid:company-logo">')
  })

  test('variável desconhecida e nomes do protótipo saem vazios', () => {
    expect(render('[{{foo}}][{{constructor}}][{{__proto__}}][{{toString}}]').html).toBe('[][][][]')
  })

  test('o texto do modelo nunca é escapado', () => {
    expect(render('<a href="https://x.com/?a=1&b=2">a & b</a>').html).toBe(
      '<a href="https://x.com/?a=1&b=2">a & b</a>',
    )
  })

  test('assunto: texto colapsado, cortado em 200, sem escape e sem HTML do sistema', () => {
    const rendered = renderContractorMailHtml({
      bodyTemplate: 'x',
      subjectTemplate: ' Nota  {{numeroNota}} {{tabelaItens}} & {{observacao}} ',
      systemHtml: { tabelaItens: '<b>x</b>' },
      values: { numeroNota: '1', observacao: 'a'.repeat(300) },
    })

    expect(rendered.subject.startsWith('Nota 1 & aaa')).toBe(true)
    expect(rendered.subject.length).toBe(200)
  })

  test('tamanho: até 524288 bytes passa; acima é problema do modelo (UTF-8, não caracteres)', () => {
    const exact = 'a'.repeat(OCCURRENCE_MAIL_HTML_MAX_BYTES)

    expect(render(exact).tooLarge).toBe(false)
    expect(render(`${exact}a`).tooLarge).toBe(true)
    expect(render('é'.repeat(OCCURRENCE_MAIL_HTML_MAX_BYTES / 2 + 1)).tooLarge).toBe(true)
    expect(render('é'.repeat(OCCURRENCE_MAIL_HTML_MAX_BYTES / 2)).tooLarge).toBe(false)
  })
})
