/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FILTER_PILLS_COMPONENT_PATH = 'src/components/ui/filter-pills.tsx'
const FILTER_PILLS_STYLES_PATH = 'src/components/ui/filter-pills.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listModuleComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src/modules', APPLICATION_ROOT), { recursive: true })
  return entries
    .filter((entry) => entry.endsWith('.component.tsx'))
    .map((entry) => `src/modules/${entry}`)
}

describe('design system filter pills contract', () => {
  test('publishes a single pill strip for every table instead of one per module', async () => {
    const component = await readApplicationFile(FILTER_PILLS_COMPONENT_PATH)

    expect(component).toContain('export type FilterPill')
    expect(component).toContain('export function FilterPills(')
    expect(component).toContain('pills: readonly FilterPill[]')
    expect(component).toContain('onClearAll')
    for (const field of ['id', 'label', 'value', 'onRemove', 'onEdit?']) {
      expect(component).toContain(field)
    }
  })

  test('takes every visible word as a prop, since the design system has no translator', async () => {
    const component = await readApplicationFile(FILTER_PILLS_COMPONENT_PATH)

    expect(component).toContain('removeLabel')
    expect(component).toContain('clearAllLabel')
    expect(component).toContain('aria-label={pill.removeLabel}')
    expect(component).not.toContain('useTranslation')
  })

  test('keeps the edit affordance optional, so a simple pill stays a plain label', async () => {
    const component = await readApplicationFile(FILTER_PILLS_COMPONENT_PATH)

    expect(component).toContain('pill.onEdit === undefined')
    expect(component).toContain('key={pill.id}')
  })

  test('renders nothing when there is no active filter, instead of an empty strip', async () => {
    const component = await readApplicationFile(FILTER_PILLS_COMPONENT_PATH)

    expect(component).toContain('pills.length === 0')
    expect(component).toContain('return null')
  })

  test('matches the square copper language with tokens only', async () => {
    const styles = await readApplicationFile(FILTER_PILLS_STYLES_PATH)

    expect(styles).toContain('border-radius: 0')
    expect(styles).toContain('var(--color-copper)')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  test('reaches the coarse-pointer touch target on the remove button', async () => {
    const styles = await readApplicationFile(FILTER_PILLS_STYLES_PATH)

    expect(styles).toContain('@media (pointer: coarse)')
  })

  test('forbids a module component from assembling its own pill', async () => {
    const components = await listModuleComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      const source = await readApplicationFile(filePath)
      if (source.includes('buildPills') || source.includes('styles.filterPill')) {
        offenders.push(filePath)
      }
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('states the rule for every future table', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/data-tables.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/filter-pills')
    expect(rule).toContain('pills.length')
    expect(projectContext).toContain('components/ui/filter-pills')
  })
})
