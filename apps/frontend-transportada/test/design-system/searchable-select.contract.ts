/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  filterSearchableOptions,
  normalizeSearchText,
  resolveSearchableSelectLabel,
  type SearchableSelectOption,
} from '@/components/ui/searchableSelect.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COMPONENT_PATH = 'src/components/ui/searchable-select.tsx'
const OPTIONS: readonly SearchableSelectOption[] = [
  { label: '001 — Banco do Brasil', value: '001' },
  { label: '033 — Santander', value: '033' },
  { label: '341 — Itaú Unibanco', value: '341' },
  { label: '756 — Sicoob', value: '756' },
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function resolveCustomOption(query: string): SearchableSelectOption | undefined {
  const code = query.replace(/\D/g, '')
  if (code.length !== 3) return undefined
  return { label: `Usar o código digitado: ${code}`, value: code }
}

describe('design system searchable select contract', () => {
  test.each([
    ['an empty query keeps every option', '', ['001', '033', '341', '756']],
    ['a code prefix narrows the list', '34', ['341']],
    ['a name match ignores the case', 'santander', ['033']],
    ['a name match ignores the accent', 'itau', ['341']],
    ['a query nobody matches empties the list', 'zzz', []],
  ])('%s', (_name, query, expected) => {
    const filtered = filterSearchableOptions({ options: OPTIONS, query })

    expect(filtered.map((option) => option.value)).toEqual(expected)
  })

  test('offers the typed code when the catalogue has no match', () => {
    const filtered = filterSearchableOptions({
      options: OPTIONS,
      query: '707',
      resolveCustomOption,
    })

    expect(filtered.map((option) => option.value)).toEqual(['707'])
    expect(filtered[0]?.label).toContain('707')
  })

  test('never duplicates an option the catalogue already lists', () => {
    const filtered = filterSearchableOptions({
      options: OPTIONS,
      query: '341',
      resolveCustomOption,
    })

    expect(filtered.map((option) => option.value)).toEqual(['341'])
    expect(filtered[0]?.label).toBe('341 — Itaú Unibanco')
  })

  test('keeps a partial code out of the custom entry', () => {
    const filtered = filterSearchableOptions({ options: OPTIONS, query: '70', resolveCustomOption })

    expect(filtered).toEqual([])
  })

  // Mostrar o placeholder com valor no state esconderia o código que o submit ainda envia.
  test.each([
    ['a catalogued value shows its label', '033', '033 — Santander'],
    ['a value outside the catalogue shows itself', '707', '707'],
    ['an empty value falls back to the placeholder', '', undefined],
  ])('%s', (_name, value, expected) => {
    expect(resolveSearchableSelectLabel({ options: OPTIONS, value })).toBe(expected as never)
  })

  test('strips diacritics and case before comparing', () => {
    expect(normalizeSearchText('Itaú Unibanco')).toBe('itau unibanco')
  })

  test('resets the active option whenever the query changes', async () => {
    const component = await readApplicationFile(COMPONENT_PATH)

    expect(component).toContain('setActiveIndex(0)')
    expect(component).toContain('}, [query])')
  })

  test('drives the panel by keyboard and mouse and announces the active option', async () => {
    const component = await readApplicationFile(COMPONENT_PATH)

    for (const contract of [
      'aria-expanded',
      'aria-haspopup="listbox"',
      'aria-activedescendant',
      'aria-controls',
      'role="combobox"',
      'role="listbox"',
      'role="option"',
      'aria-selected',
      'id={`${baseId}-${String(index)}`}',
      "scrollIntoView({ block: 'nearest' })",
      // As teclas vivem em resolveSelectSearchKey, para as duas peles decidirem igual.
      'resolveSelectSearchKey(event.key)',
      "action === 'move-down'",
      "action === 'move-up'",
      "action === 'close'",
      'onClick={() => commit(index)}',
    ]) {
      expect(component).toContain(contract)
    }
  })

  test('delegates the filtering to the service instead of reimplementing it', async () => {
    const component = await readApplicationFile(COMPONENT_PATH)

    expect(component).toContain('filterSearchableOptions({ options, query, resolveCustomOption })')
    expect(component).toContain('resolveSearchableSelectLabel({ options, value })')
    expect(component).not.toContain('options.filter(')
  })
})
