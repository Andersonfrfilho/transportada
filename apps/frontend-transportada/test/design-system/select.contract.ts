/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

import {
  filterSelectOptions,
  SELECT_SEARCH_THRESHOLD,
  shouldOfferSelectSearch,
} from '../../src/components/ui/select.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SELECT_COMPONENT_PATH = 'src/components/ui/select.tsx'
const SELECT_STYLES_PATH = 'src/components/ui/select.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system select contract', () => {
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

    // O painel vai para o document.body: tecla digitada na busca não sobe até o onKeyDown da raiz.
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

  test('pins the search field while only the option list scrolls', async () => {
    const styles = await readApplicationFile(SELECT_STYLES_PATH)

    expect(styles).toContain('.panel')
    expect(styles).toContain('.searchInput')
    expect(styles).toContain('overflow-y: auto')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('states the rule for every future select', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/selects.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/select')
    expect(rule).toContain('<select')
    expect(rule).toContain('SELECT_SEARCH_THRESHOLD')
    expect(projectContext).toContain('docs/frontend/selects.md')
  })
})
