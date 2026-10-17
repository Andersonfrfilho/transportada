/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D5): `HTML_BODY_PATTERN` é cópia do da API (nenhuma app importa código-fonte de outra). Os dois contratos
 * fixam o **mesmo valor** e a **mesma tabela de casos**: mudar um lado sem o outro quebra o teste do lado que ficou.
 */
import { describe, expect, test } from 'bun:test'

import { HTML_BODY_PATTERN } from '../../src/occurrence-automatic-mail-sweep/domain/occurrence-automatic-mail-sweep.constant.js'

const CASES: readonly (readonly [string, boolean])[] = [
  ['<p>html</p>', true],
  ['texto <b>negrito</b>', true],
  ['quebra<br/>aqui', true],
  ['</div>', true],
  ['<a href="x">link</a>', true],
  ['a < b e c > d', false],
  ['<3 amor', false],
  ['1<2', false],
  ['Nota {{numeroNota}}', false],
  ['<!-- comentário -->', false],
  ['', false],
]

describe('o corpo de e-mail com HTML que a fila do varredor recusa (spec 271)', () => {
  test('o padrão tem o valor combinado com a API', () => {
    expect(HTML_BODY_PATTERN).toBe('</?[A-Za-z][A-Za-z0-9_:-]*[\\s>/]')
  })

  test.each(CASES)('%j → %p', (body, isHtml) => {
    expect(new RegExp(HTML_BODY_PATTERN, 'u').test(body)).toBe(isHtml)
  })
})
