import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CHECKBOX_COMPONENT_PATH = 'src/components/ui/checkbox.tsx'
const CHECKBOX_STYLES_PATH = 'src/components/ui/checkbox.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system checkbox contract', () => {
  test('publishes a single checkbox in the design system instead of one per module', async () => {
    const component = await readApplicationFile(CHECKBOX_COMPONENT_PATH)

    expect(component).toContain('export function Checkbox(')
    expect(component).toContain('indeterminate')
    expect(component).toContain('disabled')
    expect(component).toContain('ariaLabel')
    expect(component).toContain('label')
  })

  test('forbids the unstyled native control everywhere outside the design system', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      if (filePath === CHECKBOX_COMPONENT_PATH) continue
      const source = await readApplicationFile(filePath)
      if (source.includes('type="checkbox"')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('keeps a label wrapper only when it owns the text, so chips never nest labels', async () => {
    const component = await readApplicationFile(CHECKBOX_COMPONENT_PATH)

    expect(component).toContain('label === undefined')
    expect(component).toContain('<span className={styles.root}>')
    expect(component).toContain('<label className={styles.root}>')
  })

  test('matches the square copper language and hides the browser widget', async () => {
    const styles = await readApplicationFile(CHECKBOX_STYLES_PATH)

    expect(styles).toContain('appearance: none')
    expect(styles).toContain('border-radius: 0')
    expect(styles).toContain('.input:checked + .box')
    expect(styles).toContain('.input:indeterminate + .box')
    expect(styles).toContain('.input:disabled + .box')
    expect(styles).toContain(
      'outline: 2px solid color-mix(in srgb, var(--color-copper) 70%, transparent)',
    )
    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  test('reaches the coarse-pointer touch target without shrinking the desktop box', async () => {
    const styles = await readApplicationFile(CHECKBOX_STYLES_PATH)

    expect(styles).toContain('@media (pointer: coarse)')
    expect(styles).toContain('calc(var(--space-10) + var(--space-1))')
  })

  test('declares the dark scheme so no native widget renders in light mode', async () => {
    const globalStyles = await readApplicationFile('src/styles/index.css')

    expect(globalStyles).toContain('color-scheme: dark')
  })

  test('states the rule for every future checkbox', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/checkboxes.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/checkbox')
    expect(rule).toContain('type="checkbox"')
    expect(projectContext).toContain('docs/frontend/checkboxes.md')
  })
})
