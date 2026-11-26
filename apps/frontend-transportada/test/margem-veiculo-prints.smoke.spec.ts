/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints da revisão de design (`web.md` §15) das abas "Por veículo" e "Por viagem" de `/contas/resultado` com marca,
 * modelo e ano abaixo da placa — claro e escuro, desktop (1440) e celular (390). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=margem-veiculo-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { VEHICLE_DETAIL } from './fleet/fleet.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.MARGEM_VEICULO_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../tmp/margem-veiculo-prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

const VEHICLES = [
  ['v-1', 'QNF0I62', 'Volvo', 'FH 540', 2021, '8049.49', '3995.40', '0.00', '8534.10'],
  ['v-2', 'EPJ5E96', 'Mercedes-Benz', 'Actros 2651', 2019, '533.57', '200.00', '0.00', '565.95'],
  ['v-3', 'HIC2C79', 'Fiat', 'Fiorino', 0, '3759.22', '3043.77', '0.00', '3986.53'],
  ['v-4', 'IUZ9D73', '', '', 0, '10457.65', '4950.14', '480.00', '11162.13'],
] as const

const LINES = VEHICLES.map(([id, , , , , revenue, cost, vehicleShare, generalShare]) => ({
  cost,
  generalShare,
  id,
  margin: String(
    (Number(revenue) - Number(cost) - Number(vehicleShare) - Number(generalShare)).toFixed(2),
  ),
  revenue,
  vehicleShare,
}))

const RESULT = {
  data: {
    byCustomer: [],
    byTrip: LINES.map((line, index) => ({
      ...line,
      id: `trip-${String(index)}`,
      trip: {
        customerId: 'sem-cliente',
        distanceMeters: 100_000,
        route: { destination: 'CAMPINAS', origin: 'RIBEIRAO PRETO' },
        vehicleId: line.id,
      },
    })),
    byVehicle: LINES,
    settings: { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' },
    totals: {
      expensesTotal: '0.00',
      profit: '0.00',
      revenue: '22800.00',
      tripCost: '11189.31',
      tripCostBreakdown: { aggregates: '4200.00', ownVans: '6989.31' },
    },
    unallocatedItems: [],
    unallocatedTotal: '0.00',
  },
}

async function openResult(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/contas/resultado')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(400)
  if (await close.isVisible()) await close.dispatchEvent('click')
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: Margem por veículo (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['expenses.read', 'expenses.manage', 'fleet.read'],
      })
      await page.route(/\/fleet\/vehicles(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: VEHICLES.map(([id, plate, brand, model, modelYear]) => ({
            ...VEHICLE_DETAIL,
            brand,
            id,
            model,
            modelYear,
            ownership: id === 'v-2' ? 'aggregate' : 'own',
            owner:
              id === 'v-2'
                ? {
                    name: 'José da Silva',
                    rntrc: '12345678',
                    state: 'SP',
                    taxId: '12345678000195',
                    taxRegime: '1',
                  }
                : null,
            plate,
          })),
          page: { nextCursor: null },
        }),
      )
      await page.route(/\/expense-forecast(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: {
            forecast: null,
            monthsOfData: 0,
            month: '2026-11',
            nextMonth: '2026-12',
            nextMonthBusinessDays: 22,
            outOfPattern: [],
            recurringExpenses: '0.00',
            status: 'unavailable',
            thresholdPercent: 10,
          },
        }),
      )
      await page.route(/\/expense-unit-costs(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: {
            general: {
              costPerKm: null,
              expensesShare: '0.00',
              kilometers: '0.000',
              totalCost: '0.00',
              tripCost: '0.00',
              vehicleId: null,
            },
            perVehicle: [],
          },
        }),
      )
      await page.route(/\/expense-result(?:\?.*)?$/, (route) =>
        fulfill(route, { calculatedAt: new Date().toISOString(), ...RESULT }),
      )
      await page.route(/\/expense-categories(?:\?.*)?$/, (route) => fulfill(route, { data: [] }))
      await loginAsLocalUser(page)
      await openResult(page)

      await page.getByRole('tab', { name: 'Por veículo' }).click()
      const panel = page.getByLabel('Por veículo')
      await expect(panel.getByText('QNF0I62')).toBeVisible()
      await expect(panel.getByText('Volvo FH 540 · 2021')).toBeVisible()
      await expect(panel.getByText('Fiat Fiorino')).toBeVisible()
      await expect(panel.getByText('Agregado: José da Silva')).toBeVisible()
      await panel.screenshot({
        path: resolve(PRINTS_DIRECTORY, `por-veiculo-${theme}-${viewport}.png`),
      })

      await page.getByRole('tab', { name: 'Por viagem' }).click()
      await expect(page.getByText('Mercedes-Benz Actros 2651 · 2019').first()).toBeVisible()
      await page.getByLabel('Por viagem').screenshot({
        path: resolve(PRINTS_DIRECTORY, `por-viagem-${theme}-${viewport}.png`),
      })
    })
  }
}
