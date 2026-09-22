import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const PERMISSIONS = ['fleet.read', 'trip.manage', 'trip.financials', 'invoices.read'] as const

for (const [nome, viewport] of [
  ['mobile', { height: 844, width: 390 }],
  ['desktop', { height: 900, width: 1280 }],
] as const) {
  test(`diálogo de ocorrência — ${nome}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockTripWorkspaceApi({ mode: 'has-pending', page, permissions: PERMISSIONS })
    await page.route(/\/company-settings\/occurrence-types$/, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
        return
      }
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              active: true,
              emailBody: '',
              emailSubject: '',
              emailTemplateKey: null,
              id: '00000000-0000-4000-8000-0000000009a1',
              name: 'Item avariado',
              notifies: false,
              stage: 'separation',
            },
          ],
        }),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        status: 200,
      })
    })
    await page.route(/\/occurrences(?:\?.*)?$/, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
        return
      }
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        status: 200,
      })
    })
    await loginAsLocalUser(page)
    await page.evaluate((tripId) => {
      window.history.pushState({}, '', `/trips/${tripId}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, TRIP_ID)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Ocorrência de separação' }).first().click()
    await page.getByRole('button', { name: 'Registrar ocorrência' }).click()
    await expect(page.getByText('Adicione ao menos uma foto')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: `/tmp/prints/picker-${nome}.png`, fullPage: false })
  })
}
