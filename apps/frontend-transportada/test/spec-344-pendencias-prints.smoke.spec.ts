/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d (`web.md` §15): o print da linha "a foto da NF X parece ser da NF Y" em /pendencias,
 * claro/escuro, 1440 e 375. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-344-pendencias-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/344-alerta-canhoto-de-outra-nota/prints',
)
const VIEWPORTS = [
  { height: 900, label: 'desktop', width: 1440 },
  { height: 844, label: 'mobile', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const

function item(index: number, details: Record<string, unknown>) {
  return {
    details: {
      documentId: `00000000-0000-4000-8000-00000000066${index}`,
      kind: 'other_document',
      readNumber: '172195',
      readSeries: '1',
      tripId: '00000000-0000-4000-8000-000000000601',
      ...details,
    },
    entityId: `00000000-0000-4000-8000-00000000095${index}`,
    entityType: 'canhotoProof',
    kind: 'canhotoOtherDocument',
    label: `93198${index}`,
  }
}

const ITEMS = [
  item(1, {
    movable: 'true',
    targetCanhotoApproved: 'false',
    targetDocumentId: '00000000-0000-4000-8000-000000000662',
    targetNumber: '172195',
    targetSameTrip: 'true',
    targetSeries: '1',
  }),
  item(2, {
    movable: null,
    targetCanhotoApproved: 'false',
    targetDocumentId: '00000000-0000-4000-8000-000000000663',
    targetNumber: '172196',
    targetSameTrip: 'false',
    targetSeries: '1',
  }),
  item(3, {
    movable: null,
    targetCanhotoApproved: null,
    targetDocumentId: null,
    targetNumber: null,
    targetSameTrip: null,
    targetSeries: null,
  }),
]

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`print das pendências de canhoto — ${theme}-${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'pendencias'))
      await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'trip.manage'] })
      await page.route(/\/pending-items(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({
            headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
            status: 204,
          })
          return
        }
        await route.fulfill({
          body: JSON.stringify({ data: ITEMS, page: { nextCursor: null } }),
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
        })
      })
      await loginAsLocalUser(page)

      const list = page.locator('main ul').first()
      await expect(list.getByText(/^A foto da NF 931981 parece ser da NF 172195/u)).toBeVisible()
      await expect(list.getByRole('button', { name: 'Aplicar' })).toHaveCount(1)
      await expect(list.getByRole('button', { name: 'Descartar' })).toHaveCount(3)
      await page.mouse.move(0, 0)
      await list.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `pendencias-${theme}-${viewport.label}.png`),
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
    })
  }
}
