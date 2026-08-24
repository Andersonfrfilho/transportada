/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

import {
  filterSelectOptions,
  resolveSelectSearchKey,
  SELECT_SEARCH_THRESHOLD,
  shouldOfferSelectSearch,
} from '../../src/components/ui/select.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SELECT_COMPONENT_PATH = 'src/components/ui/select.tsx'
const SEARCHABLE_COMPONENT_PATH = 'src/components/ui/searchable-select.tsx'
const SELECT_STYLES_PATH = 'src/components/ui/select.module.css'
const SEARCHABLE_STYLES_PATH = 'src/components/ui/searchable-select.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system select contract', () => {
  /**
   * O painel tem teto de altura; sem a lista poder encolher dentro dele, o teto recorta as opções
   * e não há barra de rolagem — as UFs depois de "CE" ficavam inalcançáveis pelo mouse.
   */
  test('scrolls the option list inside the panel instead of clipping it', async () => {
    const [selectStyles, searchableStyles] = await Promise.all([
      readApplicationFile(SELECT_STYLES_PATH),
      readApplicationFile(SEARCHABLE_STYLES_PATH),
    ])

    for (const styles of [selectStyles, searchableStyles]) {
      expect(styles).toContain('flex-direction: column')
      expect(styles).toContain('flex: 0 0 auto')
      expect(styles).toContain('flex: 1 1 auto')
      expect(styles).toContain('min-height: 0')
      expect(styles).toContain('overflow-y: auto')
    }
  })

  test('publishes a single select in the design system instead of one per module', async () => {
    const component = await readApplicationFile(SELECT_COMPONENT_PATH)

    expect(component).toContain('export function Select(')
    expect(component).toContain('export type { SelectOption }')
    expect(
      Bun.file(
        new URL('src/modules/nfe-workspace/components/SelectMenu.component.tsx', APPLICATION_ROOT),
      ).exists(),
    ).resolves.toBe(false)
  })

  test('forbids the native control everywhere outside the design system', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      if (filePath === SELECT_COMPONENT_PATH) continue
      const source = await readApplicationFile(filePath)
      if (source.includes('<select')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('drives the listbox by keyboard and announces the active option', async () => {
    const component = await readApplicationFile(SELECT_COMPONENT_PATH)

    for (const contract of [
      'aria-expanded',
      'aria-haspopup="listbox"',
      'aria-activedescendant',
      'role="listbox"',
      'role="option"',
      'aria-selected',
      "'ArrowDown'",
      "'ArrowUp'",
      'Home:',
      'End:',
      "'Enter'",
      "'Escape'",
      "' '",
    ]) {
      expect(component).toContain(contract)
    }
  })

  test('matches the square copper language and keeps the chevron off the border', async () => {
    const styles = await readApplicationFile(SELECT_STYLES_PATH)

    expect(styles).toContain('border-radius: 0')
    expect(styles).toContain('min-height: var(--field-height)')
    expect(styles).toContain('appearance: none')
    expect(styles).toContain('gap: var(--space-3)')
    expect(styles).toContain(
      'outline: 2px solid color-mix(in srgb, var(--color-copper) 70%, transparent)',
    )
    expect(styles).toContain('rotate(180deg)')
    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  test('offers a compact variant for filter bars and a disabled state for locked fieldsets', async () => {
    const [component, styles] = await Promise.all([
      readApplicationFile(SELECT_COMPONENT_PATH),
      readApplicationFile(SELECT_STYLES_PATH),
    ])

    expect(component).toContain('compact')
    expect(component).toContain('disabled')
    expect(styles).toContain('.triggerCompact')
    expect(styles).toContain(':disabled')
  })

  test('offers search by option count, so no call site has to remember to ask for it', () => {
    expect(shouldOfferSelectSearch(SELECT_SEARCH_THRESHOLD - 1)).toBe(false)
    expect(shouldOfferSelectSearch(SELECT_SEARCH_THRESHOLD)).toBe(true)
    // Um limiar de 1 ou 2 poria campo de busca em filtro de três status.
    expect(SELECT_SEARCH_THRESHOLD).toBeGreaterThan(3)
  })

  test('finds a city typed without accent or case', () => {
    const options = [
      { label: 'São Paulo', value: '3550308' },
      { label: 'Santo André', value: '3547809' },
      { label: 'Curitiba', value: '4106902' },
    ]

    expect(filterSelectOptions({ options, query: 'sao' }).map((option) => option.label)).toEqual([
      'São Paulo',
    ])
    expect(filterSelectOptions({ options, query: 'ANDRE' }).map((option) => option.label)).toEqual([
      'Santo André',
    ])
    expect(filterSelectOptions({ options, query: '  ' })).toEqual(options)
  })

  test('drives the search field by keyboard from inside the portal', async () => {
    const component = await readApplicationFile(SELECT_COMPONENT_PATH)

    for (const contract of [
      'shouldOfferSelectSearch',
      'filterSelectOptions',
      'role="combobox"',
      'handleSearchKeyDown',
      'searchInputRef',
    ]) {
      expect(component).toContain(contract)
    }
  })

  /** É o defeito relatado: o espaço na busca selecionava a opção ativa em vez de virar texto. */
  test('leaves every typing key to the search field, including the space bar', () => {
    for (const key of [' ', 'a', 'Ç', '1', 'Home', 'End', 'Backspace']) {
      expect(resolveSelectSearchKey(key)).toBe('type')
    }

    expect(resolveSelectSearchKey('ArrowDown')).toBe('move-down')
    expect(resolveSelectSearchKey('ArrowUp')).toBe('move-up')
    expect(resolveSelectSearchKey('Enter')).toBe('commit')
    expect(resolveSelectSearchKey('Escape')).toBe('close')
    expect(resolveSelectSearchKey('Tab')).toBe('close')
  })

  /**
   * Portal do React propaga pela árvore de componentes, não pela do DOM: sem parar o evento, a
   * tecla digitada na busca chega ao `onKeyDown` da raiz, onde espaço é atalho de seleção.
   */
  test('stops the search keystroke before the root handler of every select skin', async () => {
    const [select, searchable] = await Promise.all([
      readApplicationFile(SELECT_COMPONENT_PATH),
      readApplicationFile(SEARCHABLE_COMPONENT_PATH),
    ])

    for (const component of [select, searchable]) {
      expect(component).toContain('resolveSelectSearchKey')
      expect(component).toMatch(/handleSearchKeyDown[\s\S]{0,400}stopPropagation\(\)/)
    }
  })

  test('pins the search field while only the option list scrolls', async () => {
    const styles = await readApplicationFile(SELECT_STYLES_PATH)

    expect(styles).toContain('.panel')
    expect(styles).toContain('.searchInput')
    expect(styles).toContain('overflow-y: auto')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  /**
   * O gatilho é `space-between`: um quadrado solto lá dentro iria para a ponta oposta do rótulo,
   * por isso os dois vão agrupados. A cor entra por propriedade CSS — o painel é portal e nenhuma
   * classe de módulo alcança a opção.
   */
  test('paints the swatch of an option beside its label, in the list and in the trigger', async () => {
    const [component, styles] = await Promise.all([
      readApplicationFile(SELECT_COMPONENT_PATH),
      readApplicationFile(SELECT_STYLES_PATH),
    ])

    expect(component).toContain('entry.swatch')
    expect(component).toContain('selected?.swatch')
    expect(component).toContain('--select-swatch')
    expect(component).toContain('aria-hidden="true"')
    expect(styles).toContain('.swatch')
    expect(styles).toContain('.selection')
    expect(styles).toContain('var(--select-swatch)')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  /** O quadrado é decoração da opção: filtrar por rótulo não pode descartá-lo pelo caminho. */
  test('carries the swatch through the search filter', () => {
    const white = { label: 'Branca', swatch: 'var(--vehicle-color-branca)', value: 'branca' }
    const options = [
      white,
      { label: 'Preta', swatch: 'var(--vehicle-color-preta)', value: 'preta' },
    ]

    expect(filterSelectOptions({ options, query: 'bran' })).toEqual([white])
  })

  /**
   * Duas placas parecidas se distinguem pela segunda linha, e ela precisa sobreviver ao fechamento
   * do painel: o gatilho é a única prova do que foi escolhido depois que a lista some.
   */
  test('renders the detail line of an option in the list and in the trigger', async () => {
    const [component, styles] = await Promise.all([
      readApplicationFile(SELECT_COMPONENT_PATH),
      readApplicationFile(SELECT_STYLES_PATH),
    ])

    expect(component).toContain('entry.description')
    expect(component).toContain('selected?.description')
    expect(component).toContain('styles.description')
    expect(component).toContain('styles.triggerDescription')
    expect(styles).toContain('.triggerDescription')
    expect(styles).toContain('text-overflow: ellipsis')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  /** Quem procura pelo modelo não sabe a placa — é por isso que procura. */
  test('finds an option by text that lives only in its detail line', () => {
    const own = {
      description: 'Próprio da transportadora · Volvo FH 460 · Branca',
      label: 'ABC1D23 · SP',
      value: 'own-vehicle',
    }
    const options = [
      own,
      {
        description: 'Agregado · Scania R 450 · Preta',
        label: 'XYZ9K87 · MG',
        value: 'aggregate-vehicle',
      },
    ]

    expect(filterSelectOptions({ options, query: 'volvo' })).toEqual([own])
    expect(filterSelectOptions({ options, query: 'FH 460' })).toEqual([own])
  })

  /** Opção sem detalhe é a maioria: a segunda linha não pode virar espaço em branco na lista. */
  test('keeps the option without a detail line untouched', () => {
    const plain = { label: 'Aberta', value: 'open' }

    expect(filterSelectOptions({ options: [plain], query: 'aber' })).toEqual([plain])
    expect(plain).not.toHaveProperty('description')
  })

  test('states the rule for every future select', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/selects.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/select')
    expect(rule).toContain('<select')
    expect(rule).toContain('SELECT_SEARCH_THRESHOLD')
    expect(rule).toContain('swatch')
    expect(rule).toContain('description')
    expect(rule).toContain('triggerRef')
    expect(projectContext).toContain('docs/frontend/selects.md')
  })
})
