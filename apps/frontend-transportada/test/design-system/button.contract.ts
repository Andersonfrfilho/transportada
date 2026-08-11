/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const GLOBAL_STYLES_PATH = 'src/styles/index.css'

/** Casa `<button …>…</button>` inteiro, para saber se o corpo hospeda um ícone. */
const BUTTON_BLOCK = /<button\b[\s\S]*?<\/button>/g
const MODULE_CLASS = /className=\{(?:`[^`]*)?styles\.(\w+)/
const STYLES_IMPORT = /import styles from '(.+\.module\.css)'/

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

function resolveStylesheet(componentPath: string, importedPath: string): string {
  const directory = componentPath.slice(0, componentPath.lastIndexOf('/'))
  const segments = `${directory}/${importedPath}`.split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') resolved.pop()
    else resolved.push(segment)
  }
  return resolved.join('/')
}

type IconButton = Readonly<{ className: string; componentPath: string; stylesheetPath: string }>

async function listIconButtons(): Promise<readonly IconButton[]> {
  const buttons: IconButton[] = []

  for (const componentPath of await listSourceComponents()) {
    const source = await readApplicationFile(componentPath)
    const stylesImport = STYLES_IMPORT.exec(source)
    if (stylesImport === null) continue

    for (const match of source.matchAll(BUTTON_BLOCK)) {
      const block = match[0]
      if (!block.includes('<Icon')) continue
      const className = MODULE_CLASS.exec(block)
      if (className === null) continue
      buttons.push({
        className: className[1] ?? '',
        componentPath,
        stylesheetPath: resolveStylesheet(componentPath, stylesImport[1] ?? ''),
      })
    }
  }

  return buttons
}

function readDeclarations(stylesheet: string, className: string): readonly string[] {
  const blocks: string[] = []
  for (const match of stylesheet.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    const targets = selector.split(',').map((part) => part.trim())
    if (targets.some((target) => target === `.${className}`)) blocks.push(body)
  }
  return blocks
}

describe('design system button contract', () => {
  /** O ícone colado no rótulo veio daqui: cada módulo estilizava o botão e esquecia o eixo. */
  test('lays out every button that hosts an icon from one global rule', async () => {
    const styles = await readApplicationFile(GLOBAL_STYLES_PATH)
    const rule = /button:has\(svg\)\s*\{([^}]*)\}/.exec(styles)

    expect(rule).not.toBeNull()
    expect(rule?.[1]).toContain('display: inline-flex')
    expect(rule?.[1]).toContain('align-items: center')
    expect(rule?.[1]).toContain('gap: var(--space-2)')
  })

  /** Um `display` próprio vence a regra global por especificidade — e devolve o ícone colado. */
  test('lets no module class override the layout with a non-flex display', async () => {
    const buttons = await listIconButtons()
    const offenders: string[] = []

    for (const button of buttons) {
      const stylesheet = await readApplicationFile(button.stylesheetPath)
      for (const declarations of readDeclarations(stylesheet, button.className)) {
        const display = /display:\s*([\w-]+)/.exec(declarations)
        if (display !== null && !(display[1] ?? '').includes('flex')) {
          offenders.push(`${button.stylesheetPath}#${button.className}: ${display[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
    expect(buttons.length).toBeGreaterThan(40)
  })

  /** Espaçamento por token: `gap: 6px` num módulo é o começo de quatro espaçamentos diferentes. */
  test('spaces icon and label by token in every module that sets its own gap', async () => {
    const buttons = await listIconButtons()
    const offenders: string[] = []

    for (const button of buttons) {
      const stylesheet = await readApplicationFile(button.stylesheetPath)
      for (const declarations of readDeclarations(stylesheet, button.className)) {
        const gap = /gap:\s*([^;]+)/.exec(declarations)
        if (gap !== null && !(gap[1] ?? '').includes('var(--space')) {
          offenders.push(`${button.stylesheetPath}#${button.className}: ${gap[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('states the rule for every future button', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/buttons.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('button:has(svg)')
    expect(rule).toContain('components/ui/button')
    expect(projectContext).toContain('docs/frontend/buttons.md')
  })
})
