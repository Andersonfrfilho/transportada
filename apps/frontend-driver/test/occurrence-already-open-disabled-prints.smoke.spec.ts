/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (`web.md` §15) do tipo desabilitado (spec 321): a nota já tem uma
 * ocorrência aberta de "Avaria na carga", então o chip fica desabilitado, com o motivo escrito, e os
 * outros tipos seguem abertos. Fora do smoke da CI — roda com
 * `PLAYWRIGHT_TEST_MATCH=occurrence-already-open-disabled-prints.smoke.spec.ts`, o bypass de fumaça e
 * `PRINTS_DIR`. Quatro variações: claro/escuro × 375/1280.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'
import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import {
  DRIVER_DOCUMENT_ID,
  DRIVER_STOP_ID,
  SMOKE_OCCURRENCE_TYPE_IDS,
  mockDriverTripApi,
} from './driver-trip-smoke.helper'

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

const REASON = 'Já registrada nesta nota. Aguarde o escritório resolver'

test.use({ hasTouch: true })

const THEMES = ['light', 'dark'] as const

const OPEN_OCCURRENCE = {
  conversation: { exists: false },
  documentCount: 0,
  documentId: DRIVER_DOCUMENT_ID,
  documentNumber: '123',
  id: '00000000-0000-4000-8000-0000000009a1',
  kind: 'document',
  recordedAt: '2026-08-26T12:30:00.000Z',
  recordedByMe: true,
  reopenedAt: null,
  reportKey: null,
  resolution: null,
  state: 'open',
  stopId: DRIVER_STOP_ID,
  stopSequence: 1,
  type: { iconName: null, id: SMOKE_OCCURRENCE_TYPE_IDS.damagedCargo, name: 'Avaria na carga' },
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test(`print: tipo desabilitado (${viewport.width} ${theme})`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await mockDriverTripApi({ page })
      await page.route(/\/me\/trips\/current\/route-occurrences$/u, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ headers: CORS, status: 204 })
          return
        }
        await route.fulfill({
          body: JSON.stringify({ data: [OPEN_OCCURRENCE] }),
          contentType: 'application/json',
          headers: CORS,
        })
      })
      await stubKeycloakAndLogin(page)

      await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
      const group = page.getByRole('radiogroup', { name: 'Qual ocorrência?' })
      const blocked = group.getByRole('radio', { name: /Avaria na carga/u })
      await expect(blocked).toHaveAttribute('aria-disabled', 'true')
      await expect(group.getByRole('radio', { name: /Cliente ausente/u })).toBeEnabled()
      await blocked.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      /** Tocar (mobile) ou apontar (desktop) abre a dica; tocar no bloqueado nunca seleciona o tipo. */
      if (viewport.width < 600) await blocked.tap({ force: true })
      else await blocked.hover({ force: true })
      const tip = page.locator('div[id]').filter({ hasText: new RegExp(`^${REASON}$`, 'u') })
      await expect(tip.first()).toBeVisible({ timeout: 5_000 })
      await expect(blocked).toHaveAttribute('aria-checked', 'false')
      await page.waitForTimeout(600)
      await expect(tip.first()).toBeVisible()
      await page.screenshot({
        animations: 'disabled',
        path: resolve(
          PRINTS_DIRECTORY,
          `tipo-desabilitado-${viewportName}-${viewport.width}-${theme}.png`,
        ),
      })
      await expect
        .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
        .toBe(true)
    })
  }
}
