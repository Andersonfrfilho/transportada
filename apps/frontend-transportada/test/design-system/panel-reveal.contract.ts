/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REVEAL_HOOK_PATH = 'src/modules/shared/useRevealedPanel.hook.ts'
const GLOBAL_STYLES_PATH = 'src/styles/index.css'
const REVEAL_ATTRIBUTE = 'data-revealed-panel'

/** Formulário que nasce depois da lista que o abriu — é o conjunto que o defeito atingiu. */
const REVEALED_FORMS = [
  'src/modules/fleet/components/FreightRegionForm.component.tsx',
  'src/modules/fleet/components/VehicleForm.component.tsx',
  'src/modules/fleet/components/DriverForm.component.tsx',
  'src/modules/cte-profiles/components/CteProfileForm.component.tsx',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readRuleBlock(styles: string, selector: string): null | string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) return null
  const end = styles.indexOf('}', start)
  return end === -1 ? null : styles.slice(start, end)
}

describe('design system revealed panel contract', () => {
  test('publishes a single hook instead of one scroll per module', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain('export function useRevealedPanel')
    expect(hook).toContain('scrollIntoView')
  })

  /**
   * `block: 'nearest'` deixaria o painel parado quando ele nasce logo abaixo da dobra, que é
   * exatamente o caso de quem clicou em "Nova zona" e concluiu que nada aconteceu.
   */
  test('brings the panel to the top of the viewport', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain("block: 'start'")
    expect(hook).not.toContain("block: 'nearest'")
  })

  /** O scroll síncrono do foco cancelaria a rolagem suave iniciada logo antes. */
  test('focuses the first field without cancelling the scroll', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain('focus({ preventScroll: true })')
  })

  test('honours a reader who asked for less motion', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain('(prefers-reduced-motion: reduce)')
    expect(hook).toContain("'auto'")
  })

  test('skips disabled and hidden fields when choosing where to land', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain(':not([disabled])')
    expect(hook).toContain(':not([type="hidden"])')
  })

  test('stamps the panel so the global scroll margin applies', async () => {
    const hook = await readApplicationFile(REVEAL_HOOK_PATH)

    expect(hook).toContain('revealedPanel')
  })

  /** Sem a margem o painel encosta na borda de cima e o título fica colado no topo da janela. */
  test('one global rule keeps the panel off the top edge', async () => {
    const globalStyles = await readApplicationFile(GLOBAL_STYLES_PATH)
    const block = readRuleBlock(globalStyles, `[${REVEAL_ATTRIBUTE}]`)

    expect(block).not.toBeNull()
    expect(block).toContain('scroll-margin-block-start: var(--space-')
  })

  test('every editor form that mounts below its list uses the hook', async () => {
    const missing: string[] = []

    for (const filePath of REVEALED_FORMS) {
      const source = await readApplicationFile(filePath)
      const usesHook =
        source.includes("from '@/modules/shared/useRevealedPanel.hook'") &&
        source.includes('useRevealedPanel<HTMLFormElement>()') &&
        source.includes('ref={panelRef}')
      if (!usesHook) missing.push(filePath)
    }

    expect(missing).toEqual([])
  })

  test('forbids an editor form from rolling its own scroll', async () => {
    const offenders: string[] = []

    for (const filePath of REVEALED_FORMS) {
      const source = await readApplicationFile(filePath)
      if (source.includes('scrollIntoView')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
  })

  test('states the rule for every future panel', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/panels.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('useRevealedPanel')
    expect(projectContext).toContain('useRevealedPanel')
  })
})
