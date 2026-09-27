/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T902 (achado D1): o texto dentro do balão fica acima de 4,5:1 nos dois temas. A linha de
 * metadados é `<footer>`, que o estilo global pinta de cinza (2,3:1 sobre o cobre, medido pelo axe);
 * ela herda o texto do balão. O tamanho do anexo não é esmaecido.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const CSS = new URL(
  '../../src/modules/occurrence-conversation/styles/occurrenceConversation.module.css',
  import.meta.url,
)

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start) + 1)
}

describe('o contraste dentro do balão (spec 183 T902, D1)', () => {
  test('metadados herdam a cor do balão; o tamanho do anexo não esmaece', async () => {
    const css = await readFile(CSS, 'utf8')

    expect(block(css, '.meta')).toContain('color: inherit')
    expect(block(css, '.attachmentSize')).toContain('color: inherit')
    expect(block(css, '.attachmentSize')).not.toContain('color-mix')
  })
})
