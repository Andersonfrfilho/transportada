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
    expect(authProvider).toContain('${window.location.origin}/auth/callback')
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

  test('documents the trusted Vite configuration required by the identity provider', async () => {
    const environmentExample = await readApplicationFile('../../.env.example')
    const environmentConfiguration = await readApplicationFile(
      'src/modules/identity/shared/identityEnvironment.config.ts',
    )

    expect(environmentExample).toContain('VITE_API_URL=')
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
