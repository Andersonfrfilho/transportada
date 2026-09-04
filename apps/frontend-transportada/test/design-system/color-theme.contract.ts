/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  applyColorTheme,
  persistColorTheme,
  readStoredColorTheme,
  resolveEffectiveColorTheme,
} from '../../src/modules/shared/colorTheme.service'
import { COLOR_THEME_STORAGE_KEY } from '../../src/modules/shared/colorTheme.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function extractTokenBlock(source: string, selector: string): string {
  const start = source.indexOf(selector)
  expect(start).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

function extractTokens(block: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1] ?? '', (match[2] ?? '').trim())
  }
  return tokens
}

describe('design system color theme contract', () => {
  /**
   * O botão grava `data-theme` e a media query cobre quem nunca escolheu. Se os dois blocos
   * divergirem, o mesmo sistema claro mostra duas paletas diferentes conforme a pessoa tenha
   * ou não clicado no botão um dia.
   */
  test('keeps the explicit light block and the system-preference block identical', async () => {
    const styles = await readApplicationFile('src/styles/index.css')

    const explicitBlock = extractTokens(extractTokenBlock(styles, ":root[data-theme='light']"))
    const mediaStart = styles.indexOf('@media (prefers-color-scheme: light)')
    expect(mediaStart).toBeGreaterThan(-1)
    const systemBlock = extractTokens(
      extractTokenBlock(styles.slice(mediaStart), ":root:not([data-theme='dark'])"),
    )

    expect(explicitBlock.size).toBeGreaterThan(5)
    expect(Object.fromEntries(systemBlock)).toEqual(Object.fromEntries(explicitBlock))
  })

  test('flips color-scheme so native widgets follow the theme', async () => {
    const styles = await readApplicationFile('src/styles/index.css')

    expect(styles).toContain('color-scheme: dark')
    const lightBlock = extractTokenBlock(styles, ":root[data-theme='light']")
    expect(lightBlock).toContain('color-scheme: light')
  })

  /** Todo tema claro redefine só tokens que o escuro declara: token órfão não temiza nada. */
  test('redefines only tokens the dark theme declares', async () => {
    const styles = await readApplicationFile('src/styles/index.css')

    const darkTokens = extractTokens(extractTokenBlock(styles, ':root {'))
    const lightTokens = extractTokens(extractTokenBlock(styles, ":root[data-theme='light']"))

    for (const token of lightTokens.keys()) {
      expect(darkTokens.has(token)).toBe(true)
    }
  })

  test('resolves the stored choice above the system preference', () => {
    expect(resolveEffectiveColorTheme({ stored: 'dark', prefersLight: true })).toBe('dark')
    expect(resolveEffectiveColorTheme({ stored: 'light', prefersLight: false })).toBe('light')
    expect(resolveEffectiveColorTheme({ stored: undefined, prefersLight: true })).toBe('light')
    expect(resolveEffectiveColorTheme({ stored: undefined, prefersLight: false })).toBe('dark')
  })

  test('ignores an unknown stored value instead of applying it', () => {
    const storage = {
      getItem: () => 'purple',
      setItem: () => undefined,
    }

    expect(readStoredColorTheme(storage)).toBeUndefined()
    expect(readStoredColorTheme(null)).toBeUndefined()
  })

  test('writes and clears the data-theme attribute on the document element', () => {
    const documentElement = { dataset: {} as { theme?: string } }
    const themedDocument = { documentElement }

    applyColorTheme({ document: themedDocument, theme: 'light' })
    expect(documentElement.dataset.theme).toBe('light')

    applyColorTheme({ document: themedDocument, theme: undefined })
    expect(documentElement.dataset.theme).toBeUndefined()
  })

  test('persists the choice under the namespaced storage key', () => {
    const written: Record<string, string> = {}
    const storage = {
      getItem: (key: string) => written[key] ?? null,
      setItem: (key: string, value: string) => {
        written[key] = value
      },
    }

    persistColorTheme({ storage, theme: 'light' })
    expect(written[COLOR_THEME_STORAGE_KEY]).toBe('light')
    expect(readStoredColorTheme(storage)).toBe('light')
  })

  /** O botão vive no cabeçalho e aplica o tema no boot, antes do React montar. */
  test('wires the toggle into the application shell and the boot path', async () => {
    const main = await readApplicationFile('src/main.tsx')

    expect(main).toContain('useColorTheme')
    expect(main).toContain('applyColorTheme')
    expect(main).toContain('application-theme-toggle')
  })
})
