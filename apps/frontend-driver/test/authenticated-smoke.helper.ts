/* Cópia por valor de apps/frontend-transportada/test/authenticated-smoke.helper.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ **Diferença da origem**: a app do motorista não tem o atalho de autenticação do painel — o
 * `KeycloakAuthProvider.provider.ts` dela recusa por desenho (ADR-0075 §7). O login aqui é sempre
 * **real**: a etapa de identificação (`VITE_IDENTIFIER_FIRST_LOGIN`, molde do portal) manda para o
 * Keycloak de verdade, com a conta `local-user` (papel `driver`, T2.3). `VITE_SMOKE_AUTH_BYPASS`
 * segue existindo (`smokeAuthBypass.service.ts`), mas só desliga o service worker e troca a fonte
 * do `/auth/me` do Perfil — nunca a autenticação.
 */
import { expect, type Page } from '@playwright/test'

import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'

/**
 * ⚠️ Não é `VITE_DRIVER_APP_URL` de `.env` (`53200`, o que `make dev` serve): o smoke builda com
 * `VITE_DRIVER_APP_URL=http://localhost:53112` (`package.json`, script `smoke`) para não disputar
 * a porta com o processo real — `53112` é a origem extra do realm local para isto
 * (`realm/transportada-local-realm.json`, `test/keycloak-realm.contract.test.ts`).
 */
const FRONTEND_ORIGIN = 'http://localhost:53112'
const KEYCLOAK_ORIGIN = 'http://localhost:58080'
const KEYCLOAK_REALM = 'transportada-local'
const KEYCLOAK_CLIENT_ID = 'transportada-spa'
/** Identificador digitado na tela de entrada — evidence.md T2.3: resolve para o `local-user` real. */
const LOCAL_DRIVER_IDENTIFIER = 'local-user'
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

function hasExpectedAuthorizationRequest(url: URL): boolean {
  return (
    url.origin === KEYCLOAK_ORIGIN &&
    url.pathname === `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth` &&
    url.searchParams.get('client_id') === KEYCLOAK_CLIENT_ID &&
    url.searchParams.get('response_type') === 'code' &&
    url.searchParams.get('redirect_uri') === `${FRONTEND_ORIGIN}/auth/callback` &&
    url.searchParams.get('code_challenge_method') === 'S256' &&
    url.searchParams.get('code_challenge') !== null
  )
}

function getLocalUserPassword(): string {
  const password = process.env.KEYCLOAK_LOCAL_USER_PASSWORD
  if (password === undefined || password === '') {
    throw new Error('KEYCLOAK_LOCAL_USER_PASSWORD is required for authenticated smoke tests')
  }

  return password
}

export async function expectKeycloakLoginRedirect(page: Page): Promise<void> {
  await page.waitForRequest(
    (candidate) =>
      candidate.isNavigationRequest() && hasExpectedAuthorizationRequest(new URL(candidate.url())),
    { timeout: 15_000 },
  )
}

/**
 * Grava o `/auth/me` reduzido que `useAuthMeQuery` lê sob o bypass (`smoke: true`), para a tela de
 * Perfil não quebrar quando o script `smoke` liga `VITE_SMOKE_AUTH_BYPASS`. Sem efeito quando o
 * bypass está desligado (a rota real segue valendo).
 */
async function primeSmokeAuthMe(page: Page): Promise<void> {
  await page.addInitScript(
    ({ storageKey }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ data: { roles: ['driver'] } }))
    },
    { storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
}

/**
 * Login real, pela tela de identificação: digita `local-user`, segue para o Keycloak de verdade e
 * entra com a senha de `KEYCLOAK_LOCAL_USER_PASSWORD` (evidence.md T2.3).
 *
 * ⚠️ **O destino não é `/`.** É a seção `trip` (`DRIVER_ROUTE_PATH.trip = '/'` — coincide aqui, mas
 * quem afirma o caminho exato é o teste, não este helper, porque um boot sem sessão nova poderia
 * cair em outra seção no futuro.
 */
export async function loginAsLocalUser(page: Page): Promise<void> {
  await primeSmokeAuthMe(page)
  await registerNotificationMocks(page)
  await registerInstallationBrandMock(page)

  await page.goto('/')
  await page.locator('#login-identifier').waitFor()
  await page.locator('#login-identifier').fill(LOCAL_DRIVER_IDENTIFIER)

  const loginRedirectRequest = expectKeycloakLoginRedirect(page)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await loginRedirectRequest

  /**
   * ⚠️ Com `login_hint`, o tema do Keycloak pré-resolve quem é ("Entrando como local-user") e o
   * `#username` vira `type="hidden"` — só o `#password` fica visível. Tentar preencher o
   * `#username` trava no `waitFor` de visibilidade até estourar o timeout.
   */
  await page.locator('#password').fill(getLocalUserPassword())
  await page.locator('#kc-login').click()

  await expect(page).not.toHaveURL(/\/auth\/callback/u)
  await expect(page).toHaveURL(new RegExp(`^${FRONTEND_ORIGIN}/`, 'u'))
}
