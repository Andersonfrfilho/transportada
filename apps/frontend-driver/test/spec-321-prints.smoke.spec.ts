/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 321 T6: os prints da parada "Coletar canhoto" no app do motorista — claro e escuro, desktop (1280 px) e celular
 * (375 px). Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-321-prints.smoke.spec.ts` e grava os PNGs em
 * `PRINTS_DIRECTORY`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/321-canhoto-retido-pelo-cliente/prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const
/** PNG de 1x1 px: o app o reduz a JPEG no aparelho, como a foto da câmera. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const KEYCLOAK_BASE = 'http://localhost:58080/realms/transportada-local'
const KEYCLOAK_CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': `http://localhost:${process.env.PLAYWRIGHT_DRIVER_PORT ?? '53112'}`,
}

function fakeJwt(claims: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`
}

/** O login é dublado por `page.route` (o realm local não existe aqui): o que está sob prova é a tela do app. */
async function loginWithMockedKeycloak(page: Page): Promise<void> {
  let nonce = ''
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'transportada.smoke-auth-me',
      JSON.stringify({ data: { roles: ['driver'] } }),
    )
  })
  await registerNotificationMocks(page)
  await registerInstallationBrandMock(page)
  await page.route(`${KEYCLOAK_BASE}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        authorization_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/auth`,
        end_session_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/logout`,
        issuer: KEYCLOAK_BASE,
        jwks_uri: `${KEYCLOAK_BASE}/protocol/openid-connect/certs`,
        token_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/token`,
        userinfo_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/userinfo`,
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })
  await page.route(/\/protocol\/openid-connect\/auth\?/u, async (route) => {
    const url = new URL(route.request().url())
    nonce = url.searchParams.get('nonce') ?? ''
    const redirect = url.searchParams.get('redirect_uri') ?? ''
    const separator = url.searchParams.get('response_mode') === 'query' ? '?' : '#'
    const state = url.searchParams.get('state') ?? ''
    await route.fulfill({
      headers: {
        location: `${redirect}${separator}state=${state}&session_state=mock&iss=${encodeURIComponent(KEYCLOAK_BASE)}&code=mock-code`,
      },
      status: 302,
    })
  })
  await page.route(`${KEYCLOAK_BASE}/protocol/openid-connect/token`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: KEYCLOAK_CORS, status: 204 })
      return
    }
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      aud: 'transportada-spa',
      azp: 'transportada-spa',
      exp: now + 3600,
      iat: now,
      iss: KEYCLOAK_BASE,
      nonce,
      preferred_username: 'local-user',
      realm_access: { roles: ['driver'] },
      sub: 'preview-driver-321',
      typ: 'Bearer',
    }
    await route.fulfill({
      body: JSON.stringify({
        access_token: fakeJwt(claims),
        expires_in: 3600,
        id_token: fakeJwt({ ...claims, typ: 'ID' }),
        refresh_expires_in: 7200,
        refresh_token: fakeJwt({ ...claims, typ: 'Refresh' }),
        token_type: 'Bearer',
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })

  await page.goto('/')
}

async function openPickupCard(
  page: Page,
  viewport: keyof typeof VIEWPORTS,
  theme: 'dark' | 'light',
): Promise<Locator> {
  await page.setViewportSize(VIEWPORTS[viewport])
  await page.emulateMedia({ colorScheme: theme })
  await mockDriverTripApi({ page, scenario: { canhotoPickupStop: { photoSent: false } } })
  await loginWithMockedKeycloak(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { name: 'Próxima parada' }).click()
  const header = page.getByRole('button', { name: /^Parada 2/u })
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  const card = page.locator('[data-stop-card]').filter({ hasText: 'Coletar canhoto' })
  await expect(card).toBeVisible()
  return card
}

async function shot(locator: Locator, name: string): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await locator.page().mouse.move(0, 0)
  await locator.screenshot({ animations: 'disabled', path: resolve(PRINTS_DIRECTORY, name) })
  expect(
    await locator.page().evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of ['desktop', 'mobile'] as const) {
    test(`print: coletar canhoto, ${theme}, ${viewport}`, async ({ page }) => {
      const card = await openPickupCard(page, viewport, theme)
      await expect(card.getByText('NF 106187 · série 1')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Enviar canhoto' })).toBeDisabled()
      await shot(card, `coleta-vazio-${theme}-${viewport}.png`)

      await card
        .locator('input[type=file][capture]')
        .setInputFiles({ buffer: PIXEL, mimeType: 'image/png', name: 'canhoto.png' })
      await expect(card.getByRole('button', { name: 'Enviar canhoto' })).toBeEnabled()
      await shot(card, `coleta-com-foto-${theme}-${viewport}.png`)

      await card.getByRole('button', { name: 'Enviar canhoto' }).click()
      await expect(page.getByText('Foto enviada. O escritório confere o canhoto.')).toBeVisible()
      await shot(
        page.locator('[data-stop-card]').filter({ hasText: 'Coletar canhoto' }),
        `coleta-enviada-${theme}-${viewport}.png`,
      )
    })
  }
}
