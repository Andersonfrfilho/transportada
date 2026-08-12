/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COUNT_BADGE_COMPONENT_PATH = 'src/components/ui/count-badge.tsx'
const COUNT_BADGE_STYLES_PATH = 'src/components/ui/count-badge.module.css'
const HOST_CLASS_NAMES = ['iconAction', 'iconActionActive'] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listModuleFiles(suffix: string): Promise<readonly string[]> {
  const entries = await readdir(new URL('src/modules', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith(suffix)).map((entry) => `src/modules/${entry}`)
}

/** Lê um bloco de regra pelo nome da classe, para conferir o que ela declara sem parser de CSS. */
function readRuleBlock(styles: string, className: string): null | string {
  const start = styles.indexOf(`.${className} {`)
  if (start === -1) return null
  const end = styles.indexOf('}', start)
  return end === -1 ? null : styles.slice(start, end)
}

describe('design system count badge contract', () => {
  test('publishes a single count badge instead of one per module', async () => {
    const component = await readApplicationFile(COUNT_BADGE_COMPONENT_PATH)

    expect(component).toContain('export function CountBadge(')
    expect(component).toContain('count: number')
  })

  test('renders nothing without a count, so the corner stays clean', async () => {
    const component = await readApplicationFile(COUNT_BADGE_COMPONENT_PATH)

    expect(component).toContain('count <= 0')
    expect(component).toContain('return null')
  })

  test('is decorative: o número repete o que as pílulas de filtro já dizem em texto', async () => {
    const component = await readApplicationFile(COUNT_BADGE_COMPONENT_PATH)

    expect(component).toContain('aria-hidden="true"')
  })

  test('matches the square copper language with tokens only', async () => {
    const styles = await readApplicationFile(COUNT_BADGE_STYLES_PATH)

    expect(styles).toContain('border-radius: 0')
    expect(styles).toContain('var(--color-copper)')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  /**
   * Em fluxo, o número estourava a borda do botão de ícone, que tem largura fixa e `padding: 0` —
   * foi assim que a listagem de notas chegou em produção com a contagem pendurada para fora.
   */
  test('sits on the corner so the icon button never changes width', async () => {
    const styles = await readApplicationFile(COUNT_BADGE_STYLES_PATH)

    expect(styles).toContain('position: absolute')
    expect(styles).toContain('top: calc(var(--space-1) * -1)')
    expect(styles).toContain('right: calc(var(--space-1) * -1)')
  })

  test('every icon button that can host the badge is a positioning context', async () => {
    const styleSheets = await listModuleFiles('.module.css')
    const offenders: string[] = []

    for (const filePath of styleSheets) {
      const styles = await readApplicationFile(filePath)
      for (const className of HOST_CLASS_NAMES) {
        const block = readRuleBlock(styles, className)
        if (block !== null && !block.includes('position: relative')) {
          offenders.push(`${filePath} .${className}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('forbids a module from drawing its own count', async () => {
    const [components, styleSheets] = await Promise.all([
      listModuleFiles('.component.tsx'),
      listModuleFiles('.module.css'),
    ])
    const offenders: string[] = []

    for (const filePath of [...components, ...styleSheets]) {
      const source = await readApplicationFile(filePath)
      if (source.includes('filterCountPill')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('states the rule for every future table', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/data-tables.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/count-badge')
    expect(projectContext).toContain('components/ui/count-badge')
  })
})
