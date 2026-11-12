/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T5: os prints da revisão de design (`web.md` §15) — a aba Tipos com os três seletores do canhoto retido e o
 * detalhe da viagem com as coletas de canhoto (painel de encaixe, flag e tooltip), em tema claro e escuro, no desktop
 * (1440) e no celular (375). Fora do smoke da CI (o `testMatch` do `playwright.config.ts` é uma lista explícita):
 * rodar com `PLAYWRIGHT_TEST_MATCH=spec-321-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_321_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/321-canhoto-retido-pelo-cliente/prints')

const VIEWPORTS = [
  ['desktop', { height: 1000, width: 1440 }],
  ['mobile', { height: 844, width: 375 }],
] as const
const THEMES = ['light', 'dark'] as const

const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

async function fulfill(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS,
    status: 200,
  })
}

async function closeMenuWhenOpen(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.waitForTimeout(400)
}

async function navigateTo(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

const RETAINED_TYPE = {
  active: true,
  allowsMultipleItems: false,
  attachmentMode: 'optional',
  blocksContractorNotice: true,
  countsCargoOnPickupTrip: false,
  createsCanhotoPickup: true,
  emailTemplateKey: null,
  flow: 'document',
  id: '00000000-0000-4000-8000-0000000000c1',
  leavesDocumentBehind: false,
  moments: ['document'],
  name: 'Canhoto retido pelo cliente',
  notifies: true,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

const PICKUPS = [
  {
    createdAt: '2026-11-10T18:00:00.000Z',
    documentNumber: '899853',
    id: '00000000-0000-4000-8000-0000000000d1',
    nfeDocumentId: '00000000-0000-4000-8000-0000000000e1',
    occurrenceId: '00000000-0000-4000-8000-0000000000f1',
    originStopLabel: 'Rua das Acácias, 120 — Ribeirão Preto',
    originTripDocumentId: '00000000-0000-4000-8000-0000000000a1',
    originTripId: '00000000-0000-4000-8000-0000000000b1',
    pickupStopId: null,
    pickupTripId: null,
    status: 'pending',
  },
  {
    createdAt: '2026-11-10T19:00:00.000Z',
    documentNumber: '899875',
    id: '00000000-0000-4000-8000-0000000000d2',
    nfeDocumentId: '00000000-0000-4000-8000-0000000000e2',
    occurrenceId: '00000000-0000-4000-8000-0000000000f2',
    originStopLabel: 'Av. Brasil, 45 — Sertãozinho',
    originTripDocumentId: '00000000-0000-4000-8000-0000000000a2',
    originTripId: '00000000-0000-4000-8000-0000000000b1',
    pickupStopId: '00000000-0000-4000-8000-0000000000c2',
    pickupTripId: TRIP_ID,
    status: 'scheduled',
  },
]

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: seletores do canhoto retido na aba Tipos (${theme}, ${viewport})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['fleet.read', 'settings.manage', 'occurrences.resolve'],
      })
      await page.route(/\/company-settings\/occurrence-types(?:\?.*)?$/, (route) =>
        fulfill(route, { data: [RETAINED_TYPE] }),
      )
      await page.route(
        /\/company-settings\/occurrence-types\/attachment-overrides(?:\?.*)?$/,
        (route) => fulfill(route, { data: [] }),
      )
      await loginAsLocalUser(page)
      await closeMenuWhenOpen(page)
      await navigateTo(page, '/ocorrencias')
      await closeMenuWhenOpen(page)
      await page.getByRole('tab', { name: 'Tipos' }).click()
      await page.getByText('Canhoto retido pelo cliente').first().click()
      const toggle = page.getByRole('checkbox', { name: 'Nunca avisar a contratante' })
      await expect(toggle).toBeVisible()
      await expect(page.getByRole('checkbox', { name: 'Cria coleta de canhoto' })).toBeVisible()
      await toggle.scrollIntoViewIfNeeded()
      await page.screenshot({
        fullPage: false,
        path: resolve(PRINTS_DIRECTORY, `tipos-seletores-${theme}-${viewport}.png`),
      })
    })

    test(`print: coletas de canhoto na viagem (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'dispatch-flow',
        page,
        permissions: ['fleet.read', 'trip.read', 'trip.manage', 'trip.report-on-behalf'],
      })
      await page.route(/\/trip-canhoto-pickups(?:\?.*)?$/, (route) =>
        fulfill(route, { data: PICKUPS }),
      )
      await loginAsLocalUser(page)
      await closeMenuWhenOpen(page)
      await navigateTo(page, `/trips/${TRIP_ID}`)
      await closeMenuWhenOpen(page)
      const panel = page.getByRole('region', { name: 'Coletas de canhoto' })
      await expect(panel).toBeVisible()
      await expect(panel.getByText('NF 899853')).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Encaixar nesta viagem' })).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Desencaixar' })).toBeVisible()
      await panel.scrollIntoViewIfNeeded()
      await panel.screenshot({
        path: resolve(PRINTS_DIRECTORY, `viagem-coletas-${theme}-${viewport}.png`),
      })
    })
  }
}
