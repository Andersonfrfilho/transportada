/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readCssBlock, readStylesheet } from '../design-system/cssBlock.helper'

const STYLES = 'src/modules/trip/styles'
const COLUMN_QUE_ENCOLHE = 'grid-template-columns: minmax(0, 1fr)'

/**
 * Spec 246 T6.1 (CA08): a aba Tipos não passa da largura da tela. O ambiente de contrato não tem motor
 * de layout, então a geometria foi medida no navegador (evidence.md, T6.1) e estas asserções prendem
 * as causas que a medição achou: item de grid sem `minmax(0, 1fr)` e texto sem quebra herdam o
 * `min-content` do nome mais largo e alargam a página inteira.
 */
describe('aba Tipos: nada passa da largura da tela (T6.1, CA08)', () => {
  test('o grupo do cadastro é um fieldset com min-width 0 (o padrão do navegador é min-content)', async () => {
    const item = await readStylesheet(`${STYLES}/occurrenceTypeItem.module.css`)
    const group = readCssBlock(item, '.group')

    expect(group).toInclude('min-width: 0')
    expect(group).toInclude('display: grid')
  })

  test('o nome do tipo quebra em qualquer ponto em vez de alargar a linha-resumo', async () => {
    const item = await readStylesheet(`${STYLES}/occurrenceTypeItem.module.css`)
    const name = readCssBlock(item, '.name')

    expect(name).toInclude('min-width: 0')
    expect(name).toInclude('overflow-wrap: anywhere')
  })

  test('detalhes, notificação, formulário e exceções usam uma coluna que encolhe', async () => {
    const item = await readStylesheet(`${STYLES}/occurrenceTypeItem.module.css`)
    const trip = await readStylesheet(`${STYLES}/trip.module.css`)
    const exception = await readStylesheet(`${STYLES}/occurrenceException.module.css`)

    const requirement = await readStylesheet(`${STYLES}/occurrenceTypeRequirement.module.css`)

    expect(readCssBlock(requirement, '.requirements')).toInclude(COLUMN_QUE_ENCOLHE)
    expect(readCssBlock(item, '.identity')).toInclude(COLUMN_QUE_ENCOLHE)
    expect(readCssBlock(item, '.details')).toInclude(COLUMN_QUE_ENCOLHE)
    expect(readCssBlock(item, '.notification')).toInclude(COLUMN_QUE_ENCOLHE)
    expect(readCssBlock(trip, '.occurrenceForm')).toInclude(COLUMN_QUE_ENCOLHE)
    for (const selector of ['.block', '.list', '.entry']) {
      expect(readCssBlock(exception, selector)).toInclude(COLUMN_QUE_ENCOLHE)
    }
  })

  test('texto que o usuário digita ou o cadastro traz sem espaço quebra dentro da caixa', async () => {
    const item = await readStylesheet(`${STYLES}/occurrenceTypeItem.module.css`)
    const filters = await readStylesheet(`${STYLES}/occurrenceTypeFilters.module.css`)
    const exception = await readStylesheet(`${STYLES}/occurrenceException.module.css`)

    for (const selector of ['.templatePreview', '.templateNote']) {
      expect(readCssBlock(item, selector)).toInclude('overflow-wrap: anywhere')
    }
    for (const selector of ['.reason', '.emptyTitle']) {
      expect(readCssBlock(filters, selector)).toInclude('overflow-wrap: anywhere')
    }
    expect(readCssBlock(exception, '.who')).toInclude('overflow-wrap: anywhere')
  })

  test('as pílulas quebram em linhas, cada grupo na sua, como no preview — sem fileira que rola de lado', async () => {
    const filters = await readStylesheet(`${STYLES}/occurrenceTypeFilters.module.css`)
    const chips = readCssBlock(filters, '.chips')

    expect(chips).toInclude('flex-wrap: wrap')
    expect(chips).not.toInclude('overflow-x')
    expect(readCssBlock(filters, '.group')).toInclude('flex: 1 1 100%')
    expect(readCssBlock(filters, '.chip')).toInclude('max-width: 100%')
  })

  test('o rótulo do tipo mostra o texto auxiliar em slate-muted (4,5:1), nunca em slate', async () => {
    const item = await readStylesheet(`${STYLES}/occurrenceTypeItem.module.css`)

    expect(readCssBlock(item, '.tag')).toInclude('color: var(--color-slate-muted)')
  })

  test('desligado se lê pela borda tracejada, sem apagar o texto com opacity', async () => {
    const filters = await readStylesheet(`${STYLES}/occurrenceTypeFilters.module.css`)
    const exception = await readStylesheet(`${STYLES}/occurrenceException.module.css`)

    for (const selector of ['.clear:disabled', '.chip:disabled']) {
      const block = readCssBlock(filters, selector)
      expect(block).toInclude('border-style: dashed')
      expect(block).not.toInclude('opacity: 0.')
    }
    const addButton = readCssBlock(exception, '.addForm button:disabled')
    expect(addButton).toInclude('opacity: 1')
    expect(addButton).toInclude('border-style: dashed')
  })
})
