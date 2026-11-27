/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 327: prints da revisão de design — "Nova viagem" com o valor pago ao motorista e ao ajudante, em tema claro e
 * escuro, no desktop (1440) e no celular (375). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=spec-327-valor-pago-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { DRIVER_DETAIL, VEHICLE_DETAIL } from './fleet/fleet.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_327_PRINTS_DIRECTORY ?? resolve(process.cwd(), '../../tmp/spec-327-prints')
const VIEWPORTS = [
  ['desktop', { height: 1000, width: 1440 }],
  ['mobile', { height: 900, width: 375 }],
] as const
const THEMES = ['light', 'dark'] as const
const CORS = { 'access-control-allow-origin': '*' }

const DRIVERS = [
  {
    ...DRIVER_DETAIL,
    id: '00000000-0000-4000-8000-000000000941',
    name: 'Andréia Ulisses Procopio',
    score: 85,
  },
  {
    ...DRIVER_DETAIL,
    canActAsHelper: true,
    canDrive: false,
    id: '00000000-0000-4000-8000-000000000942',
    name: 'Carlos Souza',
    score: null,
  },
] as const

async function fulfill(page: Page, pattern: RegExp, body: unknown): Promise<void> {
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        headers: {
          ...CORS,
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
        status: 204,
      })
      return
    }
    await route.fulfill({
      body: JSON.stringify(body),
      contentType: 'application/json',
      headers: CORS,
    })
  })
}

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: Nova viagem com o valor pago (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['fleet.read', 'trip.manage', 'trip.financials', 'invoices.read'],
      })
      await fulfill(page, /\/fleet\/drivers(?:\?.*)?$/, {
        data: DRIVERS,
        page: { nextCursor: null },
      })
      await fulfill(page, /\/fleet\/vehicles(?:\?.*)?$/, {
        data: [{ ...VEHICLE_DETAIL, plate: 'FVB5I89' }],
        page: { nextCursor: null },
      })
      await loginAsLocalUser(page)
      await page.waitForTimeout(600)
      const close = page.getByRole('button', { name: 'Fechar menu' })
      if (await close.isVisible()) await close.dispatchEvent('click')

      await page.getByRole('button', { name: 'Nova viagem' }).click()
      const dialog = page.getByRole('dialog', { name: 'Nova viagem' })
      await expect(dialog).toBeVisible()

      await dialog.getByRole('button', { name: 'Motoristas', exact: true }).click()
      await page.getByRole('option', { name: /Andréia/u }).click()
      await page.keyboard.press('Escape')
      await dialog.getByRole('button', { name: 'Ajudantes', exact: true }).click()
      await page.getByRole('option', { name: /Carlos/u }).click()
      await page.keyboard.press('Escape')
      await dialog.getByRole('heading', { name: 'Nova viagem' }).click()

      const driverAmount = dialog.getByLabel(/Valor pago ao motorista/u)
      await driverAmount.fill('25000')
      await dialog.getByLabel(/Valor pago ao ajudante/u).fill('12000')
      await expect(driverAmount).toHaveValue('250,00')
      await driverAmount.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `nova-viagem-valor-pago-${theme}-${viewport}.png`),
      })
    })
  }
}
