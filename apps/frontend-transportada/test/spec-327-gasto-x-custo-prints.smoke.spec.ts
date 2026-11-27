/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 327: prints da revisão de design — Resultados com a seção "Gasto × custo da tripulação", em tema claro e
 * escuro, no desktop (1440) e no celular (375). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-327-gasto-x-custo-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_327_PRINTS_DIRECTORY ?? resolve(process.cwd(), '../../tmp/spec-327-prints')
const VIEWPORTS = [
  ['desktop', { height: 1000, width: 1440 }],
  ['mobile', { height: 1100, width: 375 }],
] as const
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

const SUMMARY = {
  costTotal: '41200.00',
  groups: [
    {
      costTotal: '22000.00',
      groupId: 'p1',
      groupLabel: 'Semana 1',
      isComplete: true,
      netAmount: '9000.00',
      revenueAmount: '34000.00',
      taxTotal: '3000.00',
      tripCount: 6,
    },
  ],
  isComplete: true,
  marginRate: '0.2150',
  netAmount: '18800.00',
  payrollAmount: null,
  revenueAmount: '68000.00',
  taxTotal: '8000.00',
  tripCount: 12,
}

const ROW = {
  calculatedAmount: '200.00',
  calculatedHasGaps: false,
  informedPeople: 1,
  status: 'draft',
}
const COMPARISON = [
  {
    ...ROW,
    createdAt: '2026-11-26T13:00:00.000Z',
    crewNames: ['Andréia Ulisses Procopio', 'Carlos Souza'],
    differenceAmount: '170.00',
    informedAmount: '370.00',
    tripId: '00000000-0000-4000-8000-000000000001',
  },
  {
    ...ROW,
    createdAt: '2026-11-25T13:00:00.000Z',
    crewNames: ['Marcos Lima'],
    differenceAmount: '-50.00',
    informedAmount: '150.00',
    tripId: '00000000-0000-4000-8000-000000000002',
  },
  {
    ...ROW,
    calculatedHasGaps: true,
    createdAt: '2026-11-24T13:00:00.000Z',
    crewNames: ['Paulo Reis'],
    differenceAmount: '0.00',
    informedAmount: '200.00',
    tripId: '00000000-0000-4000-8000-000000000003',
  },
]

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: Gasto × custo da tripulação (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['financial-results.read', 'trip.financials', 'fleet.read', 'billing.read'],
      })
      await page.route(/\/financial-results(?:\?.*)?$/, (route) =>
        fulfill(route, { data: SUMMARY }),
      )
      await page.route(/\/trips\/crew-cost-comparison(?:\?.*)?$/, (route) =>
        fulfill(route, { data: { items: COMPARISON } }),
      )
      await loginAsLocalUser(page)
      await page.waitForTimeout(600)
      const close = page.getByRole('button', { name: 'Fechar menu' })
      if (await close.isVisible()) await close.dispatchEvent('click')
      await page.evaluate(() => {
        window.history.pushState({}, '', '/resultados')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.waitForTimeout(500)
      if (await close.isVisible()) await close.dispatchEvent('click')

      const section = page.getByRole('region', { name: 'Gasto × custo da tripulação' })
      await expect(section).toBeVisible()
      await expect(section.getByText('Marcos Lima')).toBeVisible()
      await section.scrollIntoViewIfNeeded()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `gasto-x-custo-${theme}-${viewport}.png`),
      })
    })
  }
}
