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

type StyleRule = Readonly<{ selector: string; value: string }>

/** Sem isto o seletor capturado vem colado no comentário anterior, e nada começa com `.root`. */
function stripComments(styles: string): string {
  return styles.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Conta as classes do seletor — a especificidade que decide entre duas regras de mesma origem. */
function countClasses(selector: string): number {
  return (selector.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length
}

/** Devolve o corpo do primeiro `@media (pointer: coarse)`, casando chaves. */
function extractCoarsePointerBlock(styles: string): string {
  const start = styles.indexOf('@media (pointer: coarse)')
  if (start === -1) return ''
  const open = styles.indexOf('{', start)
  let depth = 0
  for (let index = open; index < styles.length; index += 1) {
    if (styles[index] === '{') depth += 1
    if (styles[index] === '}') {
      depth -= 1
      if (depth === 0) return styles.slice(open + 1, index)
    }
  }
  return ''
}

function removeMediaBlocks(styles: string): string {
  let result = ''
  let index = 0
  while (index < styles.length) {
    const start = styles.indexOf('@media', index)
    if (start === -1) {
      result += styles.slice(index)
      break
    }
    result += styles.slice(index, start)
    const open = styles.indexOf('{', start)
    let depth = 0
    let cursor = open
    for (; cursor < styles.length; cursor += 1) {
      if (styles[cursor] === '{') depth += 1
      if (styles[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    index = cursor + 1
  }
  return result
}

/** Declaração de uma propriedade num seletor exato, dentro do trecho dado. */
function findDeclaration(input: {
  readonly property: string
  readonly selector: string
  readonly styles: string
}): string | undefined {
  for (const match of stripComments(input.styles).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').trim() !== input.selector) continue
    const declaration = new RegExp(`${input.property}:\\s*([^;]+);`).exec(match[2] ?? '')
    if (declaration !== null) return (declaration[1] ?? '').trim()
  }
  return undefined
}

function findRootMinHeightRule(styles: string): StyleRule | undefined {
  for (const match of stripComments(styles).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim()
    const body = match[2] ?? ''
    if (!selector.startsWith('.root')) continue
    const declaration = /min-height:\s*([^;]+);/.exec(body)
    if (declaration === null) continue
    return { selector, value: (declaration[1] ?? '').trim() }
  }
  return undefined
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
    const coarse = findRootMinHeightRule(extractCoarsePointerBlock(styles))
    const base = findRootMinHeightRule(removeMediaBlocks(styles))

    expect(coarse?.value).toBe('var(--touch-target)')
    expect(base?.value).toBe('var(--space-6)')
    // 2.75rem é o alvo de toque; 1.5rem é a caixa do desktop, que não encolhe.
  })

  /**
   * A versão anterior deste contrato afirmava que a string da regra existia, e passava verde com a
   * regra **morta**: ela era `.root` dentro do `@media`, contra `.root.root` fora, e `@media` não
   * soma especificidade. O alvo medido no navegador era 24 px, não 44.
   */
  test('the coarse-pointer rule actually wins over the base rule, instead of merely existing', async () => {
    const styles = await readApplicationFile(CHECKBOX_STYLES_PATH)
    const coarse = findRootMinHeightRule(extractCoarsePointerBlock(styles))
    const base = findRootMinHeightRule(removeMediaBlocks(styles))

    expect(coarse).toBeDefined()
    expect(base).toBeDefined()
    expect(countClasses(coarse?.selector ?? '')).toBeGreaterThanOrEqual(
      countClasses(base?.selector ?? ''),
    )
  })

  /**
   * Altura sozinha não faz alvo: sem rótulo a raiz tem a largura da caixa (20 px), e é justamente a
   * variante de linha de tabela. A exceção é a raiz dentro do `label` do chamador (chip de status),
   * onde o alvo é esse `label` e alargar só empurraria o texto.
   */
  test('gives the label-less checkbox both axes, and spares the one nested in a caller label', async () => {
    const coarse = extractCoarsePointerBlock(await readApplicationFile(CHECKBOX_STYLES_PATH))

    expect(
      findDeclaration({ property: 'min-width', selector: 'span.root.root', styles: coarse }),
    ).toBe('var(--touch-target)')
    expect(
      findDeclaration({ property: 'min-width', selector: 'label span.root.root', styles: coarse }),
    ).toBe('0')
  })

  test('declares the dark scheme so no native widget renders in light mode', async () => {
    const globalStyles = await readApplicationFile('src/styles/index.css')

    expect(globalStyles).toContain('color-scheme: dark')
  })

  test('states the rule for every future checkbox', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/checkboxes.md'),
      readApplicationFile('CLAUDE.md'),
    ])

    expect(rule).toContain('components/ui/checkbox')
    expect(rule).toContain('type="checkbox"')
    expect(projectContext).toContain('docs/frontend/checkboxes.md')
  })
})
