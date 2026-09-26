/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 164, corrigido na revisão da 183 (26/09/2026): as opções da decisão saíam gigantes no portal.
 * A regra global de campo (`input { width: 100%; min-height; padding }`) pegava também o `radio`, e
 * cada bolinha virava uma caixa de 161×48 px com o texto embaixo. O campo exclui `radio` e
 * `checkbox`, e a opção é uma linha só — bolinha e texto lado a lado — com o alvo de toque inteiro.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const read = (path: string) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start) + 1)
}

describe('as opções da decisão no portal (spec 164, revisão da 183)', () => {
  test('a regra de campo não pega radio nem checkbox', async () => {
    const css = await read('styles/index.css')
    expect(css).toContain("input:not([type='radio'], [type='checkbox']),\ntextarea,\nselect {")
  })

  test('a opção é uma linha, com o alvo de toque inteiro', async () => {
    const css = await read('styles/index.css')
    const choice = block(css, '.choice')
    expect(choice).toContain('display: flex')
    expect(choice).toContain('align-items: center')
    expect(choice).toContain('min-height: var(--touch-target)')
  })

  test('o formulário usa a opção em linha, com a bolinha antes do texto', async () => {
    const form = await read('modules/occurrences/DecisionForm.component.tsx')
    expect(form).toMatch(/<label className="choice" key=\{option\.kind\}>\s*<input/u)
  })
})
