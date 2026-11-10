/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 317 Etapa 4 (T14): os prints do formulário da cobrança no recebimento do app do motorista — claro e escuro,
 * desktop (1280 px) e celular (375 px). Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-317-prints.smoke.spec.ts` e grava os PNGs em `PRINTS_DIRECTORY`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/317-cobranca-no-recebimento-vai-para-acertos/prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const
const CHARGE_TYPE_ID = '00000000-0000-4000-8000-0000000000f7'
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
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

/**
 * O Keycloak do realm local não existe no ambiente dos prints: o login é dublado por `page.route` — descoberta,
 * autorização (302 de volta com `code`) e token (JWT sem assinatura, que o keycloak-js só decodifica). O que está
 * sob prova é a tela do app, não o Keycloak.
 */
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
      sub: 'preview-driver-317',
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

async function openChargeForm(
  page: Page,
  viewport: keyof typeof VIEWPORTS,
  theme: 'dark' | 'light',
): Promise<Locator> {
  await page.setViewportSize(VIEWPORTS[viewport])
  await page.emulateMedia({ colorScheme: theme })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page })
  /** Registrada depois: a lista de tipos do dublê base é trocada pela do servidor com as duas vagas de foto. */
  await page.route(/\/me\/trips\/current\/occurrence-types$/u, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            attachmentMode: 'off',
            flow: 'stop',
            id: CHARGE_TYPE_ID,
            name: 'Cobrança no recebimento',
            noteMode: 'optional',
            photoMode: 'off',
            photoSlots: [
              {
                label: 'Foto da placa de cobrança',
                position: 0,
                required: true,
                slotKey: 'charge_sign',
              },
              {
                label: 'Foto do comprovante de pagamento',
                position: 1,
                required: true,
                slotKey: 'payment_receipt',
              },
            ],
            stopKind: 'unexpected_charge',
          },
        ],
      }),
      contentType: 'application/json',
      headers: CORS,
    })
  })
  await loginWithMockedKeycloak(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
  const form = page.getByRole('group', { name: 'Registrar ocorrência' })
  await form.getByRole('radio', { name: /Cobrança no recebimento/u }).click()
  return form
}

/** T14a: o cartão da parada com o aviso de possível cobrança (somente leitura) que o servidor manda. */
async function openStopCardWithSeal(
  page: Page,
  viewport: keyof typeof VIEWPORTS,
  theme: 'dark' | 'light',
): Promise<Locator> {
  await page.setViewportSize(VIEWPORTS[viewport])
  await page.emulateMedia({ colorScheme: theme })
  await mockDriverTripApi({
    page,
    scenario: { stopClientChargeSeal: { flaggedAt: '2026-11-01T12:00:00.000Z' } },
  })
  await loginWithMockedKeycloak(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  const notice = page.getByRole('complementary', { name: 'Aviso de cobrança' })
  await expect(notice).toBeVisible()
  return notice.locator('xpath=..')
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
    test(`print: cobrança no recebimento, ${theme}, ${viewport}`, async ({ page }) => {
      const form = await openChargeForm(page, viewport, theme)
      await expect(form.getByText('Foto da placa de cobrança *')).toBeVisible()
      await expect(form.getByRole('button', { name: 'Registrar' })).toBeDisabled()
      if (viewport === 'mobile' && theme === 'light')
        await shot(form, `cobranca-vazio-${theme}-${viewport}.png`)

      await form.getByLabel('Valor pago').fill('45')
      await form.getByRole('radio', { name: 'Eu paguei' }).click()
      await form.getByRole('button', { name: 'Tipo da chave PIX' }).click()
      await page.getByRole('option', { name: 'E-mail' }).click()
      await form.getByLabel('Sua chave PIX').fill('motorista@exemplo.com')
      const files = form.locator('input[type=file][capture]')
      await files.nth(0).setInputFiles({ buffer: PIXEL, mimeType: 'image/png', name: 'placa.png' })
      await files
        .nth(1)
        .setInputFiles({ buffer: PIXEL, mimeType: 'image/png', name: 'comprovante.png' })
      await expect(form.getByRole('button', { name: 'Registrar' })).toBeEnabled()
      await shot(form, `cobranca-completo-${theme}-${viewport}.png`)
    })
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of ['desktop', 'mobile'] as const) {
    test(`print: selo de possível cobrança na parada, ${theme}, ${viewport}`, async ({ page }) => {
      const card = await openStopCardWithSeal(page, viewport, theme)
      await shot(card, `selo-parada-${theme}-${viewport}.png`)
    })
  }
}
