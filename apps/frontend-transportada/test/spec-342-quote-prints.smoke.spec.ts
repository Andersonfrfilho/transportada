/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 342 T5: prints do orçamento por endereço (claro/escuro, 1440 e 375). Dados sintéticos e rotas
 * dubladas; fora da CI (`PLAYWRIGHT_TEST_MATCH`). O painel de parâmetros logo abaixo é o vizinho de
 * comparação: o mesmo campo, o mesmo rótulo, a mesma altura.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'

const DIRECTORY = resolve(
  process.env.SPEC_342_PRINTS_DIRECTORY ?? '/mnt/project-files/previews/orcamento-342',
)
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const VALUES = {
  adValoremPercent: '0.3',
  applyAnttFloor: true,
  driverCostPerKm: '0.9',
  expectedOccupancyPercent: '70',
  fixedCostPerKm: '0.8',
  fuelKmPerLiter: null,
  grisPercent: '0.2',
  maintenanceCostPerKm: '0.6',
  marginPercent: '15',
  tiresCostPerKm: '0.4',
}
const SETTINGS = {
  anttFloor: {
    axles: [2, 3, 4, 5, 6, 7, 9],
    cargoTypes: [{ code: 5, label: 'Carga geral' }],
    source: {
      effectiveFrom: '2026-07-17',
      resolution: 'Resolução ANTT 6.000',
      url: 'https://example.test',
    },
  },
  defaults: VALUES,
  origin: 'default',
  updatedAt: null,
  values: VALUES,
}
const RESULT = {
  adValoremAmount: '12.0000',
  anttFloor: null,
  costShareFactor: '1',
  distanceKm: '312.480',
  freightAmount: '4180.0000',
  fuelKmPerLiter: '2.5',
  fuelKmPerLiterOrigin: 'reference',
  fuelPriceOrigin: 'company-or-anp',
  fuelPricePerLitre: '6.2',
  grisAmount: '8.0000',
  lines: [
    { amount: '1820.0000', key: 'fuel' },
    { amount: '412.5000', key: 'toll' },
  ],
  marginAmount: '545.0000',
  settingsOrigin: 'default',
  shipmentCostAmount: '3635.0000',
  tollAmount: '412.5000',
  totalAmount: '4200.0000',
  tripCostAmount: '3635.0000',
}

async function json(route: Route, data: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: CORS, status: 204 })
  return route.fulfill({
    body: JSON.stringify({ data }),
    contentType: 'application/json',
    headers: CORS,
  })
}

async function open(page: Page, scheme: 'dark' | 'light'): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'transportada.smoke-auth-me',
      JSON.stringify({
        data: {
          company: { id: '00000000-0000-4000-8000-000000000001' },
          identity: { userId: '00000000-0000-4000-8000-000000000002' },
          permissions: ['freight.simulate', 'settings.manage'],
          roles: ['viewer'],
        },
      }),
    )
  })
  await page.route('**/company-users/*/picture', (route) =>
    route.fulfill({ headers: CORS, status: 404 }),
  )
  await page.route('**/auth/me', (route) =>
    json(route, {
      company: { id: '00000000-0000-4000-8000-000000000001' },
      identity: { userId: '00000000-0000-4000-8000-000000000002' },
      permissions: ['freight.simulate', 'settings.manage'],
      roles: ['viewer'],
    }),
  )
  await page.route('**/freight-quote/settings', (route) => json(route, SETTINGS))
  await page.route('**/freight-quotes/by-address', (route) => json(route, RESULT))
  await loginAsLocalUser(page)
  await page.goto('/orcamento')
  await page
    .getByRole('heading', { name: /orçamento/i })
    .first()
    .waitFor()
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, size] of [
    ['desktop', { height: 900, width: 1440 }],
    ['celular', { height: 812, width: 375 }],
  ] as const) {
    test(`orçamento por endereço, ${scheme}, ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await open(page, scheme)
      const fields = page.locator('fieldset input')
      const values = [
        '14010000',
        'Rua A',
        '100',
        'Centro',
        'Ribeirão Preto',
        'SP',
        '01310100',
        'Av. B',
        '200',
        'Bela Vista',
        'São Paulo',
        'SP',
      ]
      for (let index = 0; index < values.length; index += 1)
        await fields.nth(index).fill(values[index] ?? '')
      await page.getByRole('button', { name: /calcular/i }).click()
      await expect(page.getByText(/Estrada medida/)).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: `${DIRECTORY}/orcamento-${scheme}-${name}.png`,
      })
    })
  }
}
