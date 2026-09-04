/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COLOR_THEME_AUTH_PARAM,
  COLOR_THEME_STORAGE_KEY,
} from '@/modules/shared/colorTheme.constant'
import { appendColorThemeToLoginUrl } from '@/modules/shared/colorTheme.service'
import { shareColorThemeWithLoginScreen } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME = 'deploy/keycloak/theme/login/'
const AUTH_URL = 'http://localhost:58080/realms/r/protocol/openid-connect/auth?client_id=spa'

function repositoryFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT)).text()
}

describe('a escolha de tema atravessa a fronteira de origem até o login', () => {
  test('põe o tema em vigor na URL de login', () => {
    const url = appendColorThemeToLoginUrl({ url: AUTH_URL, theme: 'light' })

    expect(new URL(url).searchParams.get(COLOR_THEME_AUTH_PARAM)).toBe('light')
    expect(new URL(url).searchParams.get('client_id')).toBe('spa')
  })

  /** A mesma aba reautentica várias vezes; repetir o parâmetro faria a tela ler a escolha antiga. */
  test('substitui o tema anterior em vez de acrescentar outro', () => {
    const once = appendColorThemeToLoginUrl({ url: AUTH_URL, theme: 'light' })
    const twice = appendColorThemeToLoginUrl({ url: once, theme: 'dark' })

    expect(new URL(twice).searchParams.getAll(COLOR_THEME_AUTH_PARAM)).toEqual(['dark'])
  })

  /** Tema perdido é uma tela escura; um `throw` aqui é ninguém conseguir entrar. */
  test('devolve a URL como veio quando ela não se analisa', () => {
    expect(appendColorThemeToLoginUrl({ url: 'não é url', theme: 'light' })).toBe('não é url')
  })

  /**
   * A costura é `createLoginUrl` porque `init({onLoad: 'login-required'})` redireciona por dentro
   * do keycloak-js: um decorador em volta do `login()` não veria o caminho de entrada mais comum.
   */
  test('decora toda URL de login, e não só a do `login()`', async () => {
    const keycloak = { createLoginUrl: (): Promise<string> => Promise.resolve(AUTH_URL) }
    shareColorThemeWithLoginScreen({ keycloak, readTheme: () => 'light' })

    const url = await keycloak.createLoginUrl()

    expect(new URL(url).searchParams.get(COLOR_THEME_AUTH_PARAM)).toBe('light')
  })

  test('lê o tema a cada entrada, nunca o congela na montagem', async () => {
    let theme: 'dark' | 'light' = 'light'
    const keycloak = { createLoginUrl: (): Promise<string> => Promise.resolve(AUTH_URL) }
    shareColorThemeWithLoginScreen({ keycloak, readTheme: () => theme })

    const first = await keycloak.createLoginUrl()
    theme = 'dark'
    const second = await keycloak.createLoginUrl()

    expect(new URL(first).searchParams.get(COLOR_THEME_AUTH_PARAM)).toBe('light')
    expect(new URL(second).searchParams.get(COLOR_THEME_AUTH_PARAM)).toBe('dark')
  })
})

describe('o outro lado do repasse, no tema do Keycloak', () => {
  test('o script nomeia o mesmo parâmetro e a mesma chave que o painel escreve', async () => {
    const script = await repositoryFile(`${THEME}resources/js/color-theme.js`)

    expect(script).toContain(`'${COLOR_THEME_AUTH_PARAM}'`)
    expect(script).toContain(`'${COLOR_THEME_STORAGE_KEY}'`)
  })

  /**
   * Com `defer` — que é como o `theme.properties` carrega tudo — o atributo chegaria depois da
   * primeira pintura, e a tela piscaria no tema errado antes de se corrigir.
   */
  test('o script entra sem `defer` e antes da folha de estilo', async () => {
    const [template, properties] = await Promise.all([
      repositoryFile(`${THEME}template.ftl`),
      repositoryFile(`${THEME}theme.properties`),
    ])

    const script = template.indexOf('js/color-theme.js')
    const styles = template.indexOf('properties.styles?has_content')

    expect(script).toBeGreaterThan(-1)
    expect(script).toBeLessThan(styles)
    expect(template).not.toContain('js/color-theme.js" defer')
    expect(properties).not.toContain('color-theme.js')
  })

  test('a paleta clara tem as duas portas, como a do painel', async () => {
    const styles = await repositoryFile(`${THEME}resources/css/login.css`)

    expect(styles).toContain(":root[data-theme='light'] {")
    expect(styles).toContain(":root:not([data-theme='dark']) {")
  })
})
