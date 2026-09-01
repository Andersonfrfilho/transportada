import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ICON_COMPONENT_PATH = 'src/components/ui/icon.tsx'
const ICON_STYLES_PATH = 'src/components/ui/icon.module.css'
const DESIGN_SYSTEM_PREFIX = 'src/components/ui/'

/** Glifo do próprio controle, com peso de traço maior que o de ícone de ação. */
const CONTROL_GLYPH_PATHS: readonly string[] = ['src/components/ui/checkbox.tsx']

/**
 * Desenho cujo `d` chega como **dado** em tempo de execução — malha de município, e o que vier depois.
 * Não pode morar em `ICON_PATHS`: não há geometria para declarar antes de a resposta chegar.
 */
const DATA_GEOMETRY_PATHS: readonly string[] = [
  'src/components/ui/vector-map.tsx',
  // Code 128: as barras saem do cálculo da chave da NF-e, e mudam a cada nota (spec 065 D1b).
  'src/components/ui/barcode.tsx',
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

async function listModuleStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src/modules', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/modules/${entry}`)
}

describe('design system icon contract', () => {
  test('publishes a single icon set instead of one drawing per module', async () => {
    const component = await readApplicationFile(ICON_COMPONENT_PATH)

    expect(component).toContain('export function Icon(')
    expect(component).toContain('export type IconName')
    expect(component).toContain('ICON_PATHS')
    expect(component).toContain('aria-hidden="true"')
  })

  test('forbids a hand-drawn svg anywhere outside the design system', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      if (filePath.startsWith(DESIGN_SYSTEM_PREFIX)) continue
      const source = await readApplicationFile(filePath)
      if (source.includes('<svg')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('keeps the design system itself on the shared set, except the control glyph and data geometry', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      if (!filePath.startsWith(DESIGN_SYSTEM_PREFIX)) continue
      if (filePath === ICON_COMPONENT_PATH) continue
      if (CONTROL_GLYPH_PATHS.includes(filePath)) continue
      if (DATA_GEOMETRY_PATHS.includes(filePath)) continue
      const source = await readApplicationFile(filePath)
      if (source.includes('<svg')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
  })

  /** Ícone com tamanho próprio por módulo é como a divergência começa: quatro `.actionIcon` diferentes. */
  test('sizes every icon by token, never by a per-module class', async () => {
    const [styles, globalStyles] = await Promise.all([
      readApplicationFile(ICON_STYLES_PATH),
      readApplicationFile('src/styles/index.css'),
    ])

    expect(globalStyles).toContain('--icon-size-sm:')
    expect(globalStyles).toContain('--icon-size-md:')
    expect(styles).toContain('var(--icon-size-sm)')
    expect(styles).toContain('var(--icon-size-md)')
    expect(styles).toContain('stroke: currentColor')
    expect(styles).toContain('fill: none')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)

    const stylesheets = await listModuleStylesheets()
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const source = await readApplicationFile(filePath)
      if (source.includes('.actionIcon')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(stylesheets.length).toBeGreaterThan(5)
  })

  test('stops the spinner for whoever asked for less motion', async () => {
    const styles = await readApplicationFile(ICON_STYLES_PATH)

    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation: none')
  })

  /** Botão só de ícone sem rótulo acessível é um botão mudo para leitor de tela. */
  test('gives every icon-only button an accessible name', async () => {
    const components = await listSourceComponents()
    const offenders: string[] = []

    for (const filePath of components) {
      const source = await readApplicationFile(filePath)
      for (const match of source.matchAll(
        /<[Bb]utton\b([^>]*)>\s*(?:\{[^{}]*\}\s*)?<Icon\b[^>]*\/>\s*<\/[Bb]utton>/g,
      )) {
        const attributes = match[1] ?? ''
        if (!attributes.includes('aria-label')) offenders.push(filePath)
      }
    }

    expect(offenders).toEqual([])
  })

  test('states the rule for every future icon', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/icons.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/icon')
    expect(rule).toContain('<svg')
    expect(projectContext).toContain('docs/frontend/icons.md')
  })
})
