/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const APPLICATION_ICON = 'apps/frontend-transportada/public/icons/icon.svg'
const APPLICATION_TOUCH_ICON = 'apps/frontend-transportada/public/icons/icon-192.png'
const THEME_ICON = 'deploy/keycloak/theme/login/resources/img/icon.svg'
const THEME_TOUCH_ICON = 'deploy/keycloak/theme/login/resources/img/icon-192.png'
const THEME_TEMPLATE = 'deploy/keycloak/theme/login/template.ftl'

function repositoryFile(filePath: string) {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT))
}

/**
 * A tela de login é do tema Keycloak, que não importa nada da app: o ícone da aba só existe ali se
 * for cópia por valor. Sem esta guarda a app troca de marca e o login segue com o desenho antigo —
 * ou, como já esteve, sem ícone nenhum.
 */
describe('login theme tab identity contract', () => {
  test('carries the same icon the application serves', async () => {
    const [applicationIcon, themeIcon] = await Promise.all([
      repositoryFile(APPLICATION_ICON).text(),
      repositoryFile(THEME_ICON).text(),
    ])

    expect(themeIcon).toBe(applicationIcon)
  })

  test('carries the same touch icon the application serves', async () => {
    const [applicationIcon, themeIcon] = await Promise.all([
      repositoryFile(APPLICATION_TOUCH_ICON).bytes(),
      repositoryFile(THEME_TOUCH_ICON).bytes(),
    ])

    expect(themeIcon).toEqual(applicationIcon)
  })

  /** Arquivo copiado que ninguém liga no `head` é peso morto: a aba continua genérica. */
  test('links the icon and names the product in the tab title', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()

    expect(template).toContain('rel="icon" href="${url.resourcesPath}/img/icon.svg"')
    expect(template).toContain(
      'rel="apple-touch-icon" href="${url.resourcesPath}/img/icon-192.png"',
    )
    // Realm sem `displayName` resolvido não pode produzir "Entrar em " no título
    expect(template).toContain(`realm.displayName!'TransportAdA'`)
  })
})
