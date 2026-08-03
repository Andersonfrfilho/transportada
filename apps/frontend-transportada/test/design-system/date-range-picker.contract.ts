/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PICKER_COMPONENT_PATH = 'src/components/ui/date-range-picker.tsx'
const PICKER_STYLES_PATH = 'src/components/ui/date-range-picker.module.css'
const DEDICATED_PANEL_MARK = 'Filters.component.tsx'
/** Painel de filtro tanto em arquivo próprio quanto embutido na tabela que ele filtra. */
const FILTER_PANEL_MARKS = [DEDICATED_PANEL_MARK, 'Table.component.tsx'] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system date range picker contract', () => {
  test('publishes a single period picker in the design system', async () => {
    const component = await readApplicationFile(PICKER_COMPONENT_PATH)

    expect(component).toContain('export function DateRangePicker(')
    expect(component).toContain('onChange: (from: string, to: string) => void')
  })

  test('keeps the picker independent from any module stylesheet', async () => {
    const component = await readApplicationFile(PICKER_COMPONENT_PATH)

    expect(component).toContain("from './date-range-picker.module.css'")
    expect(component).not.toContain('nfeWorkspace.module.css')
    expect(component).not.toMatch(/from '\.\.\/.*\.module\.css'/)
  })

  test('skins the calendar with root tokens only', async () => {
    const styles = await readApplicationFile(PICKER_STYLES_PATH)

    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('forbids a parallel range calendar inside any module', async () => {
    const components = await listSourceComponents()
    const offenders = components.filter(
      (filePath) => filePath !== PICKER_COMPONENT_PATH && filePath.includes('DateRangePicker'),
    )

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('forbids the native date input in every filter panel', async () => {
    const components = await listSourceComponents()
    const filterPanels = components.filter((filePath) =>
      FILTER_PANEL_MARKS.some((mark) => filePath.endsWith(mark)),
    )
    const offenders: string[] = []

    for (const filePath of filterPanels) {
      const source = await readApplicationFile(filePath)
      if (source.includes('type="date"')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(filterPanels.length).toBeGreaterThan(2)
  })

  /** A tabela que embute o próprio painel escapava do guarda só por causa do nome do arquivo. */
  test('scans the tables that embed their own filter panel', async () => {
    const components = await listSourceComponents()
    const scanned = components.filter((filePath) =>
      FILTER_PANEL_MARKS.some((mark) => filePath.endsWith(mark)),
    )
    const dedicatedPanels = components.filter((filePath) => filePath.endsWith(DEDICATED_PANEL_MARK))

    expect(scanned.length).toBeGreaterThan(dedicatedPanels.length)
    expect(scanned).toContain('src/modules/billing/components/BillingInvoiceTable.component.tsx')
  })
})
