/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

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
    expect(component).toContain('export type SelectOption')
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

  test('states the rule for every future select', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/selects.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/select')
    expect(rule).toContain('<select')
    expect(projectContext).toContain('docs/frontend/selects.md')
  })
})
