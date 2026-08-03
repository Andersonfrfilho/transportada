/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TABS_COMPONENT_PATH = 'src/components/ui/tabs.tsx'
const TABS_STYLES_PATH = 'src/components/ui/tabs.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system tabs contract', () => {
  test('publishes a single tabs primitive in the design system', async () => {
    const component = await readApplicationFile(TABS_COMPONENT_PATH)

    expect(component).toContain('export function Tabs(')
    expect(component).toContain('export type TabsItem')
  })

  test('announces the tablist, the tabs and the panel', async () => {
    const component = await readApplicationFile(TABS_COMPONENT_PATH)

    for (const contract of [
      'role="tablist"',
      'role="tab"',
      'role="tabpanel"',
      'aria-selected',
      'aria-controls',
      'aria-labelledby',
      'tabIndex',
    ]) {
      expect(component).toContain(contract)
    }
  })

  test('drives the tablist by keyboard', async () => {
    const component = await readApplicationFile(TABS_COMPONENT_PATH)

    for (const contract of ['ArrowLeft:', 'ArrowRight:', 'Home:', 'End:']) {
      expect(component).toContain(contract)
    }
  })

  test('renders only the active panel so the hidden table keeps its queries quiet', async () => {
    const component = await readApplicationFile(TABS_COMPONENT_PATH)

    expect(component).toContain('activeItem')
    expect(component).not.toContain('hidden')
  })

  test('skins the tabs with root tokens only', async () => {
    const styles = await readApplicationFile(TABS_STYLES_PATH)

    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('forbids a parallel tablist anywhere outside the design system', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      if (filePath === TABS_COMPONENT_PATH) continue
      const source = await readApplicationFile(filePath)
      if (source.includes('role="tablist"')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })
})
