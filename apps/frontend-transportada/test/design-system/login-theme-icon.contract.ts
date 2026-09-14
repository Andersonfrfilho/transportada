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
const THEME_STYLESHEET = 'deploy/keycloak/theme/login/resources/css/login.css'
const THEME_MESSAGE_BUNDLES = [
  'deploy/keycloak/theme/login/messages/messages_en.properties',
  'deploy/keycloak/theme/login/messages/messages_pt_BR.properties',
] as const
const APPLICATION_ENVIRONMENT_BANNER =
  'apps/frontend-transportada/src/modules/foundation/components/EnvironmentBanner.component.tsx'

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

    expect(template).toContain(
      'rel="icon" href="${url.resourcesPath}/img/icon.svg?v=${resourcesVersion}"',
    )
    expect(template).toContain(
      'rel="apple-touch-icon" href="${url.resourcesPath}/img/icon-192.png?v=${resourcesVersion}"',
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

function readApplicationBannerLabel(source: string, environment: 'local' | 'staging'): string {
  const match = new RegExp(`${environment}:\\s*'([^']+)'`).exec(source)
  if (match?.[1] === undefined) {
    throw new Error(`EnvironmentBanner sem rótulo para ${environment}`)
  }
  return match[1]
}

/**
 * O ícone sozinho avisava só quem olha a aba. A faixa é o mesmo aviso que a app mostra no topo, e o
 * `template.ftl` é o layout de **toda** página do tema — login, troca de senha, erro, sessão expirada.
 */
describe('login theme environment banner contract', () => {
  test('shows the banner under the same closed list that swaps the icon', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()
    const bannerStart = template.indexOf('class="environment-banner"')

    expect(bannerStart).toBeGreaterThan(template.indexOf('<body'))
    const guardBeforeBanner = template.lastIndexOf('<#if workInProgress>', bannerStart)
    expect(guardBeforeBanner).toBeGreaterThan(template.indexOf('<body'))
    expect(template).toContain('appEnvironment == "local" || appEnvironment == "staging"')
  })

  test('announces the banner to screen readers without hiding the message', async () => {
    const template = await repositoryFile(THEME_TEMPLATE).text()
    const bannerStart = template.indexOf('class="environment-banner"')
    const bannerMarkup = template.slice(bannerStart, template.indexOf('</div>', bannerStart))

    expect(bannerMarkup).toContain('role="status"')
    expect(bannerMarkup).toContain('<span aria-hidden="true">🚧</span>')
    expect(bannerMarkup).toContain('<span>${msg("environmentBanner')
    expect(bannerMarkup.match(/aria-hidden/g)?.length).toBe(1)
  })

  test('says what the application banner says, in both message bundles', async () => {
    const [applicationBanner, ...bundles] = await Promise.all([
      repositoryFile(APPLICATION_ENVIRONMENT_BANNER).text(),
      ...THEME_MESSAGE_BUNDLES.map((bundle) => repositoryFile(bundle).text()),
    ])

    for (const bundle of bundles) {
      expect(bundle).toContain(
        `environmentBannerLocal=${readApplicationBannerLabel(applicationBanner, 'local')}\n`,
      )
      expect(bundle).toContain(
        `environmentBannerStaging=${readApplicationBannerLabel(applicationBanner, 'staging')}\n`,
      )
    }
  })

  /** A cor vem dos tokens do tema, que já invertem no claro; cor literal quebraria um dos dois. */
  test('paints the banner with the copied copper tokens and wraps on small screens', async () => {
    const stylesheet = await repositoryFile(THEME_STYLESHEET).text()
    const ruleStart = stylesheet.indexOf('.environment-banner {')
    const rule = stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart))

    expect(ruleStart).toBeGreaterThan(-1)
    expect(rule).toContain(
      'border: 1px solid color-mix(in srgb, var(--transportada-copper) 55%, transparent)',
    )
    expect(rule).toContain(
      'background: color-mix(in srgb, var(--transportada-copper) 18%, transparent)',
    )
    expect(rule).toContain('color: var(--transportada-fog)')
    expect(rule).toContain('flex-wrap: wrap')
    expect(rule).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
