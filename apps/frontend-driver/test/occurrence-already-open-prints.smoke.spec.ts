/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (`web.md` §15) do aviso "ocorrência já registrada" (spec 321): a API
 * responde `alreadyOpen: true` e a tela mostra o aviso em vez de "enviada". Fora do smoke da CI —
 * roda com `PLAYWRIGHT_TEST_MATCH=occurrence-already-open-prints.smoke.spec.ts`, o bypass de fumaça e
 * `PRINTS_DIR` (por padrão `prints/` dentro da app). Quatro variações: claro/escuro × 375/1280.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'
import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIR ?? resolve(process.cwd(), 'prints')
const VIEWPORTS = {
  desktop: { height: 800, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const
const KEYCLOAK = 'http://localhost:58080'
const REALM_PATH = '/realms/transportada-local'
const CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-origin': 'http://localhost:53112',
  'access-control-allow-credentials': 'true',
}

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.sig`
}

/**
 * Sem Keycloak no ambiente (sem Docker), o login é um dublê só de impressão: descoberta, `auth`
 * (volta com `code`) e `token` (JWT sem assinatura, que o keycloak-js só decodifica). A viagem e o
 * resto continuam sendo os mesmos dublês do smoke.
 */
async function stubKeycloakAndLogin(page: Page): Promise<void> {
  let nonce = ''
  await page.route(`${KEYCLOAK}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    if (url.pathname.endsWith('/auth')) {
      nonce = url.searchParams.get('nonce') ?? ''
      const redirect = url.searchParams.get('redirect_uri') ?? ''
      const state = url.searchParams.get('state') ?? ''
      await route.fulfill({
        headers: {
          location: `${redirect}#state=${state}&session_state=s1&iss=${encodeURIComponent(`${KEYCLOAK}${REALM_PATH}`)}&code=fake`,
        },
        status: 302,
      })
      return
    }
    if (url.pathname.endsWith('/token')) {
      const now = Math.floor(Date.now() / 1000)
      const claims = {
        aud: 'transportada-spa',
        exp: now + 36_000,
        iat: now,
        iss: `${KEYCLOAK}${REALM_PATH}`,
        name: 'Motorista Teste',
        nonce,
        preferred_username: 'local-user',
        realm_access: { roles: ['driver'] },
        sid: 's1',
        sub: '00000000-0000-4000-8000-0000000000aa',
      }
      await route.fulfill({
        body: JSON.stringify({
          access_token: jwt({ ...claims, typ: 'Bearer' }),
          expires_in: 36_000,
          id_token: jwt({ ...claims, typ: 'ID' }),
          refresh_expires_in: 36_000,
          refresh_token: jwt({ ...claims, typ: 'Refresh' }),
          session_state: 's1',
          token_type: 'Bearer',
        }),
        contentType: 'application/json',
        headers: CORS,
      })
      return
    }
    await route.fulfill({
      body: JSON.stringify({ issuer: `${KEYCLOAK}${REALM_PATH}` }),
      contentType: 'application/json',
      headers: CORS,
    })
  })
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'transportada.smoke-auth-me',
      JSON.stringify({ data: { roles: ['driver'] } }),
    )
  })
  await registerNotificationMocks(page)
  await registerInstallationBrandMock(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible({
    timeout: 20_000,
  })
}

const THEMES = ['light', 'dark'] as const

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test(`print: ocorrência já aberta (${viewport.width} ${theme})`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await page.context().grantPermissions(['geolocation'])
      await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
      await mockDriverTripApi({ page, scenario: { documentOccurrencesAlreadyOpen: true } })
      await stubKeycloakAndLogin(page)

      await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
      await page
        .getByRole('radiogroup', { name: 'Qual ocorrência?' })
        .getByRole('radio', { name: /Avaria na carga/u })
        .click()
      const form = page.getByRole('group', { name: 'Registrar ocorrência' })
      const chooser = page.waitForEvent('filechooser')
      await form.getByRole('button', { name: /^Tirar foto/u }).click()
      await (
        await chooser
      ).setFiles({
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
        mimeType: 'image/png',
        name: 'avaria.png',
      })
      await expect(form.getByText('Foto da ocorrência anexada')).toBeVisible()
      await form.getByRole('button', { exact: true, name: 'Registrar' }).click()

      const notice = page.getByText(
        'Esta nota já tem uma ocorrência desse tipo registrada. Não criamos outra.',
      )
      await expect(notice).toBeVisible({ timeout: 20_000 })
      await page.mouse.move(0, 0)
      const box = page.getByRole('status').filter({ has: notice })
      await box.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.screenshot({
        animations: 'disabled',
        path: resolve(
          PRINTS_DIRECTORY,
          `ocorrencia-ja-aberta-${viewportName}-${viewport.width}-${theme}.png`,
        ),
      })
      await expect
        .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
        .toBe(true)
    })
  }
}
