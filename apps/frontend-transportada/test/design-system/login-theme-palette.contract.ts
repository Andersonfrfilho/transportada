/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const APPLICATION_STYLES = 'apps/frontend-transportada/src/styles/index.css'
const THEME_STYLES = 'deploy/keycloak/theme/login/resources/css/login.css'

/** Os oito papéis semânticos que as duas paletas nomeiam, cada lado com o seu prefixo. */
const SHARED_ROLES = [
  'alert',
  'asphalt',
  'copper',
  'fog',
  'graphite',
  'ink-on-accent',
  'ready',
  'slate',
] as const

function repositoryFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT)).text()
}

function extractBlock(source: string, selector: string): string {
  const start = source.indexOf(selector)
  expect(start).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

function extractRoles(block: string, prefix: string): Record<string, string> {
  const roles: Record<string, string> = {}
  for (const role of SHARED_ROLES) {
    const match = block.match(new RegExp(`--${prefix}-${role}:\\s*([^;]+);`))
    if (match?.[1] !== undefined) {
      roles[role] = match[1].trim()
    }
  }
  return roles
}

function lightBlockOf(source: string, selector: string): string {
  const mediaStart = source.indexOf('@media (prefers-color-scheme: light)')
  expect(mediaStart).toBeGreaterThan(-1)
  return extractBlock(source.slice(mediaStart), selector)
}

/**
 * O tema do Keycloak não importa código nosso e não passa por build: a paleta dele é cópia por
 * valor. Sem esta guarda o painel ganha tema claro e o login continua escuro — e quem entra
 * atravessa duas identidades visuais no mesmo gesto.
 */
describe('login theme palette contract', () => {
  test('carries the same dark palette the application declares', async () => {
    const [styles, theme] = await Promise.all([
      repositoryFile(APPLICATION_STYLES),
      repositoryFile(THEME_STYLES),
    ])

    const application = extractRoles(extractBlock(styles, ':root {'), 'color')
    const login = extractRoles(extractBlock(theme, ':root {'), 'transportada')

    expect(Object.keys(application)).toEqual([...SHARED_ROLES])
    expect(login).toEqual(application)
  })

  test('carries the same light palette the application declares', async () => {
    const [styles, theme] = await Promise.all([
      repositoryFile(APPLICATION_STYLES),
      repositoryFile(THEME_STYLES),
    ])

    const application = extractRoles(
      lightBlockOf(styles, ":root:not([data-theme='dark'])"),
      'color',
    )
    const login = extractRoles(lightBlockOf(theme, ':root {'), 'transportada')

    expect(Object.keys(application)).toEqual([...SHARED_ROLES])
    expect(login).toEqual(application)
  })

  /**
   * Sem `color-scheme` os widgets nativos do Keycloak (autofill, seleção, barra de rolagem)
   * continuam escuros sobre a folha clara.
   */
  test('flips color-scheme so the login widgets follow the theme', async () => {
    const theme = await repositoryFile(THEME_STYLES)

    expect(extractBlock(theme, ':root {')).toContain('color-scheme: dark')
    expect(lightBlockOf(theme, ':root {')).toContain('color-scheme: light')
  })

  /**
   * A marca da Ada é silhueta por filtro: sem a troca ela fica branca sobre papel branco, e o
   * rodapé perde o desenho sem perder o espaço dele.
   */
  test('turns the Ada mark into a dark silhouette under the light theme', async () => {
    const theme = await repositoryFile(THEME_STYLES)

    expect(extractBlock(theme, ':root {')).toContain(
      '--transportada-mark-filter: brightness(0) invert(1);',
    )
    expect(lightBlockOf(theme, ':root {')).toContain('--transportada-mark-filter: brightness(0);')
    expect(theme).toContain('filter: var(--transportada-mark-filter);')
  })

  /**
   * O cobre claro é escuro o bastante para o texto claro em cima dele; clarear no hover, como o
   * tema escuro faz, empurraria o par para 3,8:1 justamente no botão de entrar.
   */
  test('moves the accent away from the page on hover in both themes', async () => {
    const theme = await repositoryFile(THEME_STYLES)

    expect(extractBlock(theme, ':root {')).toContain('white 14%')
    expect(lightBlockOf(theme, ':root {')).toContain('black 14%')
    expect(theme).toContain('background: var(--transportada-copper-hover);')
  })
})
