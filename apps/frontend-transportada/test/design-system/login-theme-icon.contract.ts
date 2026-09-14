/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const APPLICATION_ICON = 'apps/frontend-transportada/public/icons/icon.svg'
const APPLICATION_TOUCH_ICON = 'apps/frontend-transportada/public/icons/icon-192.png'
const THEME_ICON = 'deploy/keycloak/theme/login/resources/img/icon.svg'
const APPLICATION_WORK_IN_PROGRESS_ICON =
  'apps/frontend-transportada/public/icons/icon-work-in-progress.svg'
const THEME_WORK_IN_PROGRESS_ICON =
  'deploy/keycloak/theme/login/resources/img/icon-work-in-progress.svg'
const THEME_PROPERTIES = 'deploy/keycloak/theme/login/theme.properties'
const COMPOSE = 'compose.yaml'
const RAILWAY_CONFIG = '.railway/railway.ts'
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

  /**
   * A tela de login era a **única** do produto que não avisava o ambiente: a app troca o ícone da
   * aba fora de produção e o tema seguia com a marca de produção em toda instalação.
   */
  test('carries the work in progress icon the application serves', async () => {
    const [applicationIcon, themeIcon] = await Promise.all([
      repositoryFile(APPLICATION_WORK_IN_PROGRESS_ICON).text(),
      repositoryFile(THEME_WORK_IN_PROGRESS_ICON).text(),
    ])

    expect(themeIcon).toBe(applicationIcon)
  })

  /**
   * ⚠️ **Lista fechada, e o desconhecido cai em produção.** Medido em container de sonda: sem a
   * variável declarada o Keycloak deixa o **literal** `${env.TRANSPORTADA_APP_ENV}` no valor da
   * propriedade — a propriedade nunca fica vazia, então um `<#if>` que testasse conteúdo deixaria o
   * 🚧 ligado na instalação do cliente. O template compara com `local` e `staging`, e mais nada.
   */
  test('swaps the icon only for the environments it knows', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()

    expect(template).toContain('appEnvironment == "local" || appEnvironment == "staging"')
    expect(template).toContain('img/icon-work-in-progress.svg')
    /**
     * `?seq_contains` sobre sequência literal é recusado pelo FreeMarker do Keycloak — a condição
     * sai sempre falsa, e o ícone de produção aparece em todo ambiente. A guarda é sobre o **uso**,
     * não sobre a palavra: o comentário acima da regra explica justamente por que ela não está ali.
     */
    expect(template).not.toContain(']?seq_contains(')
  })

  /** Propriedade sem a variável no container é aviso que nunca acende. */
  test('reads the environment from the container and compose declares it', async () => {
    const [properties, compose] = await Promise.all([
      repositoryFile(THEME_PROPERTIES).text(),
      repositoryFile(COMPOSE).text(),
    ])

    expect(properties).toContain('appEnvironment=${env.TRANSPORTADA_APP_ENV}')
    expect(compose).toContain('TRANSPORTADA_APP_ENV: ${VITE_APP_ENV}')
  })

  /**
   * ⚠️ **O deploy declara o valor, não o painel.** Medido em 2026-09-08: a variável não existia no
   * serviço `keycloak` de staging, e sem ela o tema cai em produção — staging se passando por
   * produção, sem erro nenhum. `preserve()` manteria justamente o nada que estava lá.
   */
  test('the deployment declares the environment instead of trusting the panel', async () => {
    const railway = await repositoryFile(RAILWAY_CONFIG).text()

    expect(railway).toContain("TRANSPORTADA_APP_ENV: isProduction ? 'production' : 'staging'")
  })
})
