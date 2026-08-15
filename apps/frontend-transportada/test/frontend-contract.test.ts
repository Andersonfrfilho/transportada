import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('frontend foundation contract', () => {
  test('declares the independent Vite, PWA, i18n and Query foundation', async () => {
    const packageManifest = await readApplicationFile('package.json')
    const viteConfiguration = await readApplicationFile('vite.config.ts')

    expect(packageManifest).toContain('"vite"')
    expect(packageManifest).toContain('"@tanstack/react-query"')
    expect(packageManifest).toContain('"i18next"')
    expect(packageManifest).toContain('"vite-plugin-pwa"')
    expect(packageManifest).toContain('"workbox-window"')
    expect(viteConfiguration).toContain('VitePWA')
    expect(viteConfiguration).toContain('devOptions')
    expect(viteConfiguration).toContain('enabled: true')
    expect(viteConfiguration).toContain("navigateFallback: '/index.html'")
  })

  test('keeps the foundation status clear without operational fiscal data', async () => {
    const page = await readApplicationFile('src/modules/foundation/pages/FoundationStatus.page.tsx')

    expect(page).toContain('foundation.operationDisabled')
    expect(page).not.toContain('NF-e')
    expect(page).not.toContain('CT-e')
  })

  test('defines responsive coverage for mobile, tablet and desktop', async () => {
    const styles = await readApplicationFile('src/styles/index.css')
    const englishLocale = await readApplicationFile(
      'src/modules/foundation/locales/foundation.en.locale.json',
    )

    expect(styles).toContain('@media (min-width: 48rem)')
    expect(styles).toContain('@media (min-width: 40rem)')
    expect(styles).toContain('@media (min-width: 64rem)')
    expect(styles).toContain('@media (min-width: 80rem)')
    expect(styles).toContain('prefers-reduced-motion')
    expect(englishLocale).toContain('"operationDisabled"')
  })

  test('allows the Makefile smoke gate to reuse explicitly started CI servers', async () => {
    const playwrightConfiguration = await readApplicationFile('playwright.config.ts')

    expect(playwrightConfiguration).toContain("'PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER'")
    expect(playwrightConfiguration).toContain("'PLAYWRIGHT_REUSE_EXISTING_API_SERVER'")
    expect(playwrightConfiguration).toContain('PLAYWRIGHT_FRONTEND_PORT')
    expect(playwrightConfiguration).toContain('PLAYWRIGHT_API_PORT')
    expect(playwrightConfiguration).toContain('reuseExistingServer: REUSE_EXISTING_FRONTEND_SERVER')
    expect(playwrightConfiguration).toContain('reuseExistingServer: REUSE_EXISTING_API_SERVER')
  })

  /**
   * O comando do webServer compila antes de servir, e o padrão de 60s do Playwright cobre os dois.
   * Num runner mais lento o `vite build` sozinho consumiu 12s e a espera estourou sem nenhum teste
   * chegar a rodar — falha de orçamento, não do produto. A folga tem que ser explícita.
   */
  test('gives each smoke web server room to build before serving', async () => {
    const playwrightConfiguration = await readApplicationFile('playwright.config.ts')
    const declaredTimeouts = [
      ...playwrightConfiguration.matchAll(/timeout: WEB_SERVER_TIMEOUT_MS/g),
    ]

    expect(playwrightConfiguration).toMatch(/const WEB_SERVER_TIMEOUT_MS = (\d[\d_]*)/)
    expect(declaredTimeouts).toHaveLength(2)

    const configuredTimeout = Number(
      /const WEB_SERVER_TIMEOUT_MS = ([\d_]+)/
        .exec(playwrightConfiguration)?.[1]
        ?.replaceAll('_', ''),
    )
    expect(configuredTimeout).toBeGreaterThanOrEqual(180_000)
  })

  test('matches the /auth/me response by the configured API base url, proxied or direct', async () => {
    const { isAuthMeResponseUrl } = await import('./smoke-api-url.helper')

    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53001',
        url: 'http://localhost:53001/auth/me',
      }),
    ).toBe(true)
    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53000/api',
        url: 'http://localhost:53000/api/auth/me',
      }),
    ).toBe(true)
    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53000/api/',
        url: 'http://localhost:53000/api/auth/me',
      }),
    ).toBe(true)
    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53000/api',
        url: 'http://localhost:53001/auth/me',
      }),
    ).toBe(false)
    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53001',
        url: 'http://localhost:53001/auth/me/extra',
      }),
    ).toBe(false)
    expect(
      isAuthMeResponseUrl({
        apiBaseUrl: 'http://localhost:53001',
        url: 'http://localhost:53001/auth/session',
      }),
    ).toBe(false)
  })

  // A origem fixa no helper matava o login real assim que VITE_API_URL passou a apontar para o proxy
  test('keeps the authenticated smoke login free of a hardcoded API origin', async () => {
    const smokeHelper = await readApplicationFile('test/authenticated-smoke.helper.ts')
    const apiUrlHelper = await readApplicationFile('test/smoke-api-url.helper.ts')

    expect(smokeHelper).toContain('isAuthMeResponseUrl')
    expect(smokeHelper).toContain('getApiBaseUrl')
    expect(smokeHelper).not.toContain('http://localhost:53001')
    expect(apiUrlHelper).toContain('process.env.VITE_API_URL')
  })

  test('proxies the API in preview with the same rule the dev server uses', async () => {
    const viteConfiguration = await readApplicationFile('vite.config.ts')

    expect(viteConfiguration).toContain('preview:')
    expect(viteConfiguration).toContain('proxy: API_PROXY')
    expect(viteConfiguration.match(/proxy: API_PROXY/g)).toHaveLength(2)
  })

  test('exposes a smoke run that exercises the real Keycloak login', async () => {
    const packageManifest: unknown = JSON.parse(await readApplicationFile('package.json'))
    const scripts = (packageManifest as { readonly scripts: Record<string, string> }).scripts

    expect(scripts['smoke']).toContain('VITE_SMOKE_AUTH_BYPASS=true')
    expect(scripts['smoke:auth']).toBeDefined()
    expect(scripts['smoke:auth']).not.toContain('VITE_SMOKE_AUTH_BYPASS')
    expect(scripts['smoke:auth']).toContain('playwright test')
  })

  test('uses Keycloak Authorization Code with PKCE and never persists tokens', async () => {
    const packageManifest = await readApplicationFile('package.json')
    const authProvider = await readApplicationFile(
      'src/modules/identity/shared/KeycloakAuthProvider.provider.ts',
    )
    const smokeAuthBypass = await readApplicationFile(
      'src/modules/identity/shared/smokeAuthBypass.service.ts',
    )

    expect(packageManifest).toContain('"keycloak-js": "26.2.4"')
    expect(authProvider).toContain('checkLoginIframe: false')
    expect(authProvider).toContain("onLoad: 'login-required'")
    expect(authProvider).toContain("pkceMethod: 'S256'")
    expect(authProvider).toContain('getIdentityEnvironment().appBaseUrl')
    expect(authProvider).toContain('${AUTHENTICATION_CALLBACK_PATH}')
    expect(authProvider).not.toContain('window.location.origin')
    expect(authProvider).toContain('keycloak.updateToken')
    expect(authProvider).toContain('keycloak.clearToken()')
    expect(authProvider).toContain('keycloak.login')
    expect(authProvider).not.toContain('localStorage')
    expect(authProvider).not.toContain('sessionStorage')
    expect(authProvider).not.toContain('indexedDB')
    expect(smokeAuthBypass).toContain('VITE_SMOKE_AUTH_BYPASS')
    expect(smokeAuthBypass).toContain('LOCAL_SMOKE_HOSTNAMES')
    expect(smokeAuthBypass).toContain('localhost')
    expect(smokeAuthBypass).toContain('127.0.0.1')
  })

  test('fetches the typed authenticated identity without caching it in the service worker', async () => {
    const identityQuery = await readApplicationFile(
      'src/modules/identity/queries/useAuthMe.query.ts',
    )
    const viteConfiguration = await readApplicationFile('vite.config.ts')

    expect(identityQuery).toContain("'/auth/me'")
    expect(identityQuery).toContain('authorization: `Bearer ${accessToken}`')
    expect(identityQuery).toContain('getAccessToken')
    expect(identityQuery).toContain('isAuthMeResponse')
    expect(viteConfiguration).not.toContain('auth-cache')
    expect(viteConfiguration).not.toContain('/auth/me')
  })

  test('accepts the full company permission catalogue emitted by the API auth/me contract', async () => {
    const { isAuthMeResponse } = await import('../src/modules/identity/queries/useAuthMe.query')

    const response = {
      data: {
        company: { id: '00000000-0000-0000-0000-000000000001' },
        identity: { userId: '00000000-0000-0000-0000-000000000002' },
        permissions: [
          'users.manage',
          'invoices.import',
          'invoices.read',
          'batches.create',
          'batches.approve',
          'freight.simulate',
          'cte.manage',
          'cte.submit',
          'cte.issue',
          'cte.cancel',
          'cte.read',
          'billing.create',
          'billing.cancel',
          'billing.read',
          'settings.manage',
          'operations.read',
          'audit.read',
          'view-preferences.manage',
          'fleet.read',
          'fleet.manage',
          'mdfe.read',
          'mdfe.manage',
          'mdfe.issue',
          'mdfe.close',
          'mdfe.cancel',
          'nfse.manage',
          'nfse.issue',
          'nfse.cancel',
          'nfse.read',
          'trip.read',
          'trip.report',
        ],
        roles: ['company-admin'],
      },
    }

    expect(isAuthMeResponse(response)).toBe(true)
  })

  test('accepts the driver field role with its own trip permissions', async () => {
    const { isAuthMeResponse } = await import('../src/modules/identity/queries/useAuthMe.query')

    const response = {
      data: {
        company: { id: '00000000-0000-0000-0000-000000000001' },
        identity: { userId: '00000000-0000-0000-0000-000000000002' },
        permissions: ['trip.read', 'trip.report'],
        roles: ['driver'],
      },
    }

    expect(isAuthMeResponse(response)).toBe(true)
  })

  // A allowlist atrasada em relação à API rejeita um 200 válido e a tela cai em "Indisponível"
  test('keeps the allowlist in sync with the API authorization policy', async () => {
    const policySource = await readApplicationFile(
      '../../apps/api-transportada/src/identity/domain/authorization.policy.ts',
    )
    const identityQuery = await readApplicationFile(
      'src/modules/identity/queries/useAuthMe.query.ts',
    )
    const schemaSource = await readApplicationFile(
      '../../apps/api-transportada/src/database/identity.schema.ts',
    )

    const readLiterals = (source: string, constantName: string): readonly string[] => {
      const block = new RegExp(`${constantName} = (?:Object\\.freeze\\()?\\[([^\\]]*)\\]`).exec(
        source,
      )?.[1]
      if (block === undefined) {
        throw new Error(`Expected ${constantName} in the versioned source`)
      }

      return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
    }

    const apiPermissions = readLiterals(policySource, 'TRANSPORTADA_PERMISSIONS').filter(
      (permission) => permission !== 'companies.manage',
    )
    const frontendPermissions = readLiterals(identityQuery, 'COMPANY_PERMISSIONS')
    const apiRoles = readLiterals(schemaSource, 'COMPANY_ROLES')
    const frontendRoles = readLiterals(identityQuery, 'COMPANY_ROLES')

    expect(apiPermissions.length).toBeGreaterThan(0)
    expect(frontendPermissions).toEqual(apiPermissions)
    expect(frontendRoles).toEqual(apiRoles)
  })

  test('documents the trusted Vite configuration required by the identity provider', async () => {
    const environmentExample = await readApplicationFile('../../.env.example')
    const environmentConfiguration = await readApplicationFile(
      'src/modules/identity/shared/identityEnvironment.config.ts',
    )

    expect(environmentExample).toContain('VITE_API_URL=')
    expect(environmentExample).toContain('VITE_APP_URL=')
    expect(environmentExample).toContain('VITE_KEYCLOAK_URL=')
    expect(environmentExample).toContain('VITE_KEYCLOAK_REALM=')
    expect(environmentExample).toContain('VITE_KEYCLOAK_CLIENT_ID=')
    expect(environmentConfiguration).toContain("url.protocol === 'http:'")
    expect(environmentConfiguration).toContain("url.protocol !== 'https:'")
    expect(environmentConfiguration).toContain("url.hostname === 'localhost'")
    expect(environmentConfiguration).toContain("url.username !== ''")
    expect(environmentConfiguration).toContain("url.password !== ''")
  })
})
