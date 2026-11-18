/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints da revisão de design (`web.md` §15) do diálogo "Aprovar candidatura de empresa" (CPF de quem dirige),
 * em tema claro e escuro, desktop (1440) e celular (375). Fora do smoke da CI: rodar com
 * `PLAYWRIGHT_TEST_MATCH=aprovar-candidatura-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.APROVAR_CANDIDATURA_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/aprovar-candidatura-cnpj/prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 812, width: 375 },
} as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const APPLICATION = {
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-11-17T12:00:00.000Z',
  declaredData: {},
  driverId: null,
  duplicateDriverId: null,
  email: 'contato@transportesfulano.com.br',
  id: '00000000-0000-4000-8000-000000000a01',
  latestSubmission: null,
  name: 'Transportes Fulano',
  phone: '11988887777',
  rejectionReason: '',
  resubmittedAt: null,
  reviewedAt: null,
  status: 'pending',
  taxId: '12345678000195',
  updatedAt: '2026-11-17T12:00:00.000Z',
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: aprovar candidatura de CNPJ (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'fleet.manage'] })
      await page.route(/\/aggregate-applications(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ headers: CORS, status: 204 })
          return
        }
        await route.fulfill({
          body: JSON.stringify({ data: [APPLICATION] }),
          contentType: 'application/json',
          headers: CORS,
          status: 200,
        })
      })
      await loginAsLocalUser(page)
      await page.waitForTimeout(600)
      const closeMenu = page.getByRole('button', { name: 'Fechar menu' })
      if (await closeMenu.isVisible()) await closeMenu.dispatchEvent('click')
      await page.evaluate(() => {
        window.history.pushState({}, '', '/fleet')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      await page.getByRole('tab', { name: 'Candidaturas' }).click()
      await page.getByRole('button', { name: 'Aprovar' }).click()
      await expect(
        page.getByRole('dialog', { name: 'Aprovar candidatura de empresa' }),
      ).toBeVisible()
      await page.getByLabel('CPF de quem dirige').fill('52998224725')
      await page.screenshot({
        fullPage: false,
        path: resolve(PRINTS_DIRECTORY, `diálogo-${theme}-${viewport}.png`.replace('á', 'a')),
      })
    })
  }
}
