/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Cópia por valor de apps/frontend-transportada/test/design-system/color-theme.contract.ts (ADR-0075 §7). */
import { describe, expect, test } from 'bun:test'

import { COLOR_THEME_STORAGE_KEY } from '../../src/modules/shared/colorTheme.constant'
import {
  appendColorThemeToLoginUrl,
  applyColorTheme,
  persistColorTheme,
  readStoredColorTheme,
  resolveEffectiveColorTheme,
} from '../../src/modules/shared/colorTheme.service'
import { shareColorThemeWithLoginScreen } from '../../src/modules/shared/KeycloakAuthProvider.provider'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** Os oito tokens de cor que o app do motorista consome — os do painel, com os mesmos nomes. */
const DRIVER_COLOR_TOKENS = [
  '--color-alert',
  '--color-asphalt',
  '--color-copper',
  '--color-fog',
  '--color-graphite',
  '--color-ink-on-accent',
  '--color-ready',
  '--color-slate',
] as const

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

/**
 * Spec 231. O app do motorista nasceu só escuro; o claro entra como o do painel: os mesmos nomes de
 * token com os papéis invertidos, em duas portas para o mesmo bloco.
 */
describe('tema claro do app do motorista (spec 231)', () => {
  /**
   * O botão grava `data-theme` e a media query cobre quem nunca escolheu. Se os dois blocos
   * divergirem, o mesmo sistema claro mostra duas paletas conforme a pessoa tenha clicado um dia.
   */
  test('o bloco explícito e o do sistema são idênticos', async () => {
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

  test('o claro redefine todos os tokens de cor que o app usa, e só os que o escuro declara', async () => {
    const styles = await readApplicationFile('src/styles/index.css')

    const darkTokens = extractTokens(extractTokenBlock(styles, ':root {'))
    const lightTokens = extractTokens(extractTokenBlock(styles, ":root[data-theme='light']"))

    for (const token of DRIVER_COLOR_TOKENS) expect(lightTokens.has(token)).toBe(true)
    for (const token of lightTokens.keys()) expect(darkTokens.has(token)).toBe(true)
  })

  test('o color-scheme vira junto, para os controles nativos', async () => {
    const styles = await readApplicationFile('src/styles/index.css')

    expect(styles).toContain('color-scheme: dark')
    expect(extractTokenBlock(styles, ":root[data-theme='light']")).toContain('color-scheme: light')
  })

  test('a escolha guardada vale mais que o sistema', () => {
    expect(resolveEffectiveColorTheme({ prefersLight: true, stored: 'dark' })).toBe('dark')
    expect(resolveEffectiveColorTheme({ prefersLight: false, stored: 'light' })).toBe('light')
    expect(resolveEffectiveColorTheme({ prefersLight: true, stored: undefined })).toBe('light')
    expect(resolveEffectiveColorTheme({ prefersLight: false, stored: undefined })).toBe('dark')
  })

  test('valor guardado desconhecido é ausência, não é aplicado', () => {
    const storage = { getItem: () => 'roxo', setItem: () => undefined }

    expect(readStoredColorTheme(storage)).toBeUndefined()
    expect(readStoredColorTheme(null)).toBeUndefined()
  })

  test('escreve e apaga o data-theme no elemento raiz', () => {
    const documentElement = { dataset: {} as { theme?: string } }

    applyColorTheme({ document: { documentElement }, theme: 'light' })
    expect(documentElement.dataset.theme).toBe('light')
    applyColorTheme({ document: { documentElement }, theme: undefined })
    expect(documentElement.dataset.theme).toBeUndefined()
  })

  test('a escolha é guardada na chave com namespace', () => {
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

  /** ADR-0060: o tema viaja na URL, porque o Keycloak é outra origem e não alcança o localStorage. */
  test('a escolha viaja na URL de login, com set e não append', () => {
    const once = appendColorThemeToLoginUrl({ theme: 'light', url: 'https://sso.test/auth?x=1' })
    const twice = appendColorThemeToLoginUrl({ theme: 'dark', url: once })

    expect(new URL(once).searchParams.get('transportada_theme')).toBe('light')
    expect(new URL(twice).searchParams.getAll('transportada_theme')).toEqual(['dark'])
    expect(appendColorThemeToLoginUrl({ theme: 'dark', url: 'não é url' })).toBe('não é url')
  })

  test('o Keycloak do motorista leva o tema à tela de login em toda entrada', async () => {
    const keycloak = {
      createLoginUrl: (): Promise<string> => Promise.resolve('https://sso.test/auth?client=x'),
    }
    shareColorThemeWithLoginScreen({ keycloak, readTheme: () => 'light' })

    const url = new URL(await keycloak.createLoginUrl())

    expect(url.searchParams.get('transportada_theme')).toBe('light')
    const provider = await readApplicationFile(
      'src/modules/shared/KeycloakAuthProvider.provider.ts',
    )
    expect(provider).toContain('shareColorThemeWithLoginScreen({')
  })

  test('o boot aplica a escolha guardada e o Perfil tem o botão', async () => {
    const main = await readApplicationFile('src/main.tsx')
    const profile = await readApplicationFile(
      'src/modules/driver-trip/pages/DriverProfile.page.tsx',
    )

    expect(main).toContain('applyColorTheme(')
    expect(profile).toContain('useColorTheme')
    expect(profile).toContain("t('theme.")
  })
})
