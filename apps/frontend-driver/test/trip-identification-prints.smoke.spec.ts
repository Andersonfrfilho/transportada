/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da identificação das viagens no app do motorista (pedido do usuário, 10/11/2026): a listagem com a faixa
 * data/viagem à esquerda e placa (Mercosul e antiga) à direita, cada uma com o copiar, e as cidades da rota sob o
 * trajeto. Claro e escuro, desktop (1280 px) e celular (375 px). Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=trip-identification-prints.smoke.spec.ts` e grava os PNGs em `PRINTS_DIRECTORY`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIRECTORY ?? resolve(process.cwd(), 'prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

function fakeStop(id: string, label: string, sequence: number) {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id,
    label,
    latitude: null,
    longitude: null,
    sequence,
  }
}

const TRIPS = [
  {
    createdAt: '2026-11-10T12:00:00.000Z',
    id: 'b8608455-0000-4000-8000-000000000100',
    status: 'dispatched',
    stops: [
      fakeStop('s1', 'R SARAH MIGUEL FELIX, 1500, ALTINOPOLIS, SP', 1),
      fakeStop('s2', 'Rua Tres, 30, GUARACI, SP', 2),
      fakeStop('s3', 'Rua Cinco, 50, SAO JOAQUIM DA BARRA, SP', 3),
      fakeStop('s4', 'Rua Seis, 60, MIGUELOPOLIS, SP', 4),
      fakeStop('s5', 'RUA QUATRO, 124, ORLANDIA, SP', 5),
    ],
    vehiclePlate: 'IUZ9D73',
  },
  {
    createdAt: '2026-11-09T12:00:00.000Z',
    id: '3f1c92ab-0000-4000-8000-000000000200',
    status: 'dispatched',
    stops: [
      fakeStop('t1', 'Rua Teste, 100, SANTA FE DO SUL, SP', 1),
      fakeStop('t2', 'Rua Dois, 20, PALMEIRA D OESTE, SP', 2),
      fakeStop('t3', 'Rua Teste, 100, RUBINEIA, SP', 3),
    ],
    vehiclePlate: 'ABC1234',
  },
]

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

async function openSelector(
  page: Page,
  viewport: keyof typeof VIEWPORTS,
  theme: 'dark' | 'light',
): Promise<Locator> {
  await page.setViewportSize(VIEWPORTS[viewport])
  await page.emulateMedia({ colorScheme: theme })
  await mockDriverTripApi({ page })
  await page.route(/\/me\/trips\/current$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        data: { isRegisteredDriver: true, pendingProofs: [], score: null, trips: TRIPS },
      }),
      contentType: 'application/json',
      headers: CORS,
    })
  })
  await loginWithMockedKeycloak(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  const selector = page.getByRole('group', { name: 'Suas viagens' })
  await expect(selector).toBeVisible()
  return page.locator('header').filter({ hasText: 'Minha viagem' }).locator('xpath=..').first()
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of ['desktop', 'mobile'] as const) {
    test(`print: identificação das viagens, ${theme}, ${viewport}`, async ({ page }) => {
      const area = await openSelector(page, viewport, theme)
      await area.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await page.mouse.move(0, 0)
      await page.screenshot({
        animations: 'disabled',
        clip: {
          height: viewport === 'mobile' ? 700 : 520,
          width: VIEWPORTS[viewport].width,
          x: 0,
          y: 0,
        },
        path: resolve(PRINTS_DIRECTORY, `identificacao-${theme}-${viewport}.png`),
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
    })
  }
}
