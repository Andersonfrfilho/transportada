/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readCssBlock, readStylesheet } from './cssBlock.helper'

const UI = 'src/components/ui'
const VIEWPORT_CAP = 'max-width: calc(100vw - var(--space-4))'

/**
 * Spec 246 T6.1 (CA08): o painel de `Select`, `MultiSelect` e `SearchableSelect` abria com a largura
 * da opção mais longa e passava da borda direita do celular (581px em 375px). Geometria medida no
 * navegador (evidence.md); aqui ficam as causas, que o ambiente de contrato consegue ler.
 */
describe('camadas flutuantes cabem na tela (T6.1, CA08)', () => {
  test('os três painéis têm teto de largura na viewport', async () => {
    for (const file of ['select', 'multi-select', 'searchable-select']) {
      const stylesheet = await readStylesheet(`${UI}/${file}.module.css`)
      expect(readCssBlock(stylesheet, '.panel')).toInclude(VIEWPORT_CAP)
    }
  })

  test('o rótulo da opção quebra e o detalhe fica numa linha com reticências', async () => {
    const select = await readStylesheet(`${UI}/select.module.css`)

    expect(readCssBlock(select, '.option')).toInclude('overflow-wrap: anywhere')
    expect(readCssBlock(select, '.option')).not.toInclude('white-space: nowrap')
    expect(readCssBlock(select, '.description')).toInclude('white-space: nowrap')
  })

  test('o gatilho do tooltip nunca é mais largo que o contêiner', async () => {
    const tooltip = await readStylesheet(`${UI}/tooltip.module.css`)

    expect(readCssBlock(tooltip, '.trigger')).toInclude('max-width: 100%')
  })

  test('o detalhe do gatilho só ocupa a sobra e o rótulo tem title com o texto inteiro', async () => {
    const select = await readStylesheet(`${UI}/select.module.css`)
    const component = await readStylesheet(`${UI}/select.tsx`)

    expect(readCssBlock(select, '.triggerDescription')).toInclude('flex: 1 1 0')
    expect(component).toInclude('title={selected?.label}')
    expect(component).toInclude('title={selected.description}')
  })
})

describe('alvo de toque e contraste dos seletores (T6.1, CA08)', () => {
  test('no toque o gatilho compacto, a opção e a busca sobem a 44px', async () => {
    const select = await readStylesheet(`${UI}/select.module.css`)
    const coarse = readCssBlock(select, '@media (pointer: coarse)')

    expect(coarse).toMatch(
      /\.triggerCompact,\s*\.option\s*\{[^}]*min-height: var\(--touch-target\)/,
    )
    expect(coarse).toMatch(/\.searchInput\s*\{[^}]*min-height: var\(--touch-target\)/)
    for (const file of ['multi-select', 'searchable-select']) {
      const stylesheet = await readStylesheet(`${UI}/${file}.module.css`)
      expect(readCssBlock(stylesheet, '@media (pointer: coarse)')).toInclude(
        'min-height: var(--touch-target)',
      )
    }
  })

  test('no toque remover e limpar tudo das pílulas têm 44px e não encolhem', async () => {
    const pills = await readStylesheet(`${UI}/filter-pills.module.css`)
    const coarse = readCssBlock(pills, '@media (pointer: coarse)')

    expect(coarse).toMatch(/\.remove\s*\{[^}]*flex: 0 0 auto[^}]*width: var\(--touch-target\)/)
    expect(coarse).toMatch(/\.clearAll\s*\{[^}]*min-height: var\(--touch-target\)/)
  })

  test('rótulo da pílula em slate-muted; desligado sem opacity; escolhida e em foco só com véu leve', async () => {
    const pills = await readStylesheet(`${UI}/filter-pills.module.css`)
    const select = await readStylesheet(`${UI}/select.module.css`)
    const disabled = readCssBlock(select, '.trigger:disabled')

    expect(readCssBlock(pills, '.label')).toInclude('color: var(--color-slate-muted)')
    expect(disabled).not.toInclude('opacity')
    expect(disabled).toInclude('border-style: dashed')
    expect(readCssBlock(select, '.optionSelected.optionActive')).toInclude('copper) 5%')
  })
})
