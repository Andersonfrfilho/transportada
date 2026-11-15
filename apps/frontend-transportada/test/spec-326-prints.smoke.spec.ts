/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326: os prints da revisão de design (`web.md` §15) da página `/orcamento` — claro e escuro,
 * desktop (1440) e celular (390). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-326-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_326_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/326-orcamento-de-frete-pelo-custo/prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

const DEFAULTS = {
  adValoremPercent: '0.3000',
  applyAnttFloor: true,
  driverCostPerKm: '0.9000',
  expectedOccupancyPercent: '85.0000',
  fixedCostPerKm: '0.8000',
  fuelKmPerLiter: null,
  grisPercent: '0.2000',
  maintenanceCostPerKm: '0.6000',
  marginPercent: '15.0000',
  tiresCostPerKm: '0.4000',
}

const CARGO_TYPES = [
  'Granel sólido',
  'Granel líquido',
  'Frigorificada ou aquecida',
  'Conteinerizada',
  'Carga geral',
  'Neogranel',
  'Perigosa (granel sólido)',
  'Perigosa (granel líquido)',
  'Perigosa (frigorificada ou aquecida)',
  'Perigosa (conteinerizada)',
  'Perigosa (carga geral)',
  'Carga granel pressurizada',
].map((label, index) => ({ code: index + 1, label }))

const SETTINGS = {
  data: {
    anttFloor: {
      axles: [2, 3, 4, 5, 6, 7, 9],
      cargoTypes: CARGO_TYPES,
      source: {
        effectiveFrom: '2026-07-17',
        resolution: 'Resolução ANTT nº 6.084/2026 (Anexo II)',
        url: 'https://anttlegis.antt.gov.br/',
      },
    },
    defaults: DEFAULTS,
    origin: 'default',
    updatedAt: null,
    values: DEFAULTS,
  },
}

const QUOTE = {
  data: {
    adValoremAmount: '300.0000',
    anttFloor: {
      applied: true,
      axlesUsed: 5,
      cc: '657.56',
      ccd: '6.6718',
      floorAmount: '3993.4600',
      table: 'A',
    },
    costShareFactor: '1.0000',
    freightAmount: '3993.4600',
    fuelKmPerLiter: '2.5000',
    fuelKmPerLiterOrigin: 'reference',
    fuelPriceOrigin: 'company-or-anp',
    fuelPricePerLitre: '6.0000',
    grisAmount: '200.0000',
    lines: [
      { amount: '1200.0000', key: 'fuel' },
      { amount: '450.0000', key: 'driver' },
      { amount: '500.0000', key: 'maintenanceAndTires' },
      { amount: '400.0000', key: 'fixed' },
      { amount: '0.0000', key: 'toll' },
    ],
    marginAmount: '450.0000',
    settingsOrigin: 'default',
    shipmentCostAmount: '2550.0000',
    totalAmount: '4493.4600',
    tripCostAmount: '2550.0000',
  },
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

async function openQuote(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/orcamento')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(400)
  if (await close.isVisible()) await close.dispatchEvent('click')
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: Orçamento (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['freight.simulate', 'settings.manage'],
      })
      await page.route(/\/freight-quote\/settings(?:\?.*)?$/, (route) => fulfill(route, SETTINGS))
      await page.route(/\/freight-quotes(?:\?.*)?$/, (route) => fulfill(route, QUOTE))
      await loginAsLocalUser(page)
      await openQuote(page)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Orçamento de frete' }),
      ).toBeVisible()
      await page.getByLabel('Distância (km)').fill('500')
      await page.getByRole('button', { name: 'Calcular' }).click()
      await expect(page.getByText('Total do orçamento')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `orcamento-${theme}-${viewport}.png`),
      })
    })
  }
}
