/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T9: prints da origem da ordem das paradas e do botão "Ordenar paradas" no detalhe da
 * viagem (claro/escuro, 1440 e 375). Rodam por fora da CI: `PLAYWRIGHT_TEST_MATCH`.
 */
import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const PRINTS_DIRECTORY = new URL(
  '../../../specs/323-paradas-ordenadas-no-rascunho/prints/',
  import.meta.url,
)
mkdirSync(PRINTS_DIRECTORY, { recursive: true })

const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 812, width: 375 },
} as const

for (const state of ['suggested', 'error'] as const) {
  for (const viewport of ['desktop', 'mobile'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`print da ordem das paradas — ${state} ${viewport} ${theme}`, async ({ page }) => {
        if (state === 'error') process.env.SMOKE_STOP_ORDER_ERROR = 'ROUTING_MATRIX_UNAVAILABLE'
        else delete process.env.SMOKE_STOP_ORDER_ERROR
        await page.setViewportSize(VIEWPORTS[viewport])
        await page.emulateMedia({ colorScheme: theme })
        const api = await mockTripWorkspaceApi({
          mode: 'document-cost-open',
          page,
          permissions: ['fleet.read', 'trip.manage'],
        })
        await loginAsLocalUser(page)
        await page.evaluate((tripId) => {
          window.history.pushState({}, '', `/trips/${tripId}`)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, TRIP_ID)
        const button = page.getByRole('button', { name: 'Ordenar paradas' })
        await expect(button).toBeVisible()
        const box = await button.boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(36)
        await button.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: new URL(`t9-${state}-${viewport}-${theme}.png`, PRINTS_DIRECTORY).pathname,
        })
        expect(api.failures()).toEqual([])
      })
    }
  }
}
