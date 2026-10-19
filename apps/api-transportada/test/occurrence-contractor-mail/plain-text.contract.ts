/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.2 (ADR-0110 §4, D4): a parte texto gerada do HTML renderizado.
 */
import { describe, expect, test } from 'bun:test'

import { htmlToPlainText } from '../../src/occurrence-conversation/domain/occurrence-mail-plain-text.policy.js'

describe('spec 272: htmlToPlainText', () => {
  test('tira tags, preserva quebras de bloco e <br>', () => {
    const html =
      '<p>Olá <b>Alfa</b>,</p><div>Linha 1<br>Linha 2<br/>Linha 3</div><ul><li>a</li><li>b</li></ul>'

    expect(htmlToPlainText(html)).toBe('Olá Alfa,\nLinha 1\nLinha 2\nLinha 3\na\nb')
  })

  test('remove comentários (marcadores da área e condicionais), head, style e title', () => {
    const html = [
      '<html><head><title>T</title><style>p { color: red }</style></head><body>',
      '<!--[if mso]><table><tr><td>mso</td></tr></table><![endif]-->',
      '<!-- mensagem --><p>Texto</p><!-- /mensagem -->',
      '<STYLE type="text/css">x{}</STYLE></body></html>',
    ].join('')

    expect(htmlToPlainText(html)).toBe('Texto')
  })

  test('células viram espaço e linhas de tabela viram quebra', () => {
    const html =
      '<table><tr><td>001</td><td>Caixa</td><td>2 UN</td></tr><tr><td>002</td><td>Pallet</td><td>1 UN</td></tr></table>'

    expect(htmlToPlainText(html)).toBe('001 Caixa 2 UN\n002 Pallet 1 UN')
  })

  test('entidades numa passada só, com &amp; por último: &amp;lt; não vira <', () => {
    expect(
      htmlToPlainText('<p>&amp;lt; &lt;b&gt; &quot;a&quot; &#39;b&#39; &#x41; &#65; &amp;amp;</p>'),
    ).toBe('&lt; <b> "a" \'b\' A A &amp;')
  })

  test('valor escapado que parece tag não é tirado como tag', () => {
    expect(htmlToPlainText('<p>&lt;script&gt;x&lt;/script&gt;</p>')).toBe('<script>x</script>')
  })

  test('nbsp vira espaço e linhas em branco colapsam', () => {
    expect(htmlToPlainText('<p>a&nbsp;b</p><p></p><p></p><p>c</p>')).toBe('a b\n\nc')
  })
})

describe('spec 272 review A2: entidade que vira NUL ou substituto solto', () => {
  test('&#0;, &#xD800;, &#57343; e acima de U+10FFFF somem', () => {
    expect(htmlToPlainText('<p>a&#0;b&#xD800;c&#57343;d&#x110000;e&#xD83D;f</p>')).toBe('abcdef')
  })

  test('código válido continua: &#x1F600; e &#65;', () => {
    expect(htmlToPlainText('<p>&#x1F600; &#65;</p>')).toBe('\u{1F600} A')
  })
})
