/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (emenda de 19/11/2026): os prints da revisão de design — a busca de notas da "Nova viagem" oferecendo a nota
 * com canhoto retido (flag "Canhoto retido") ao lado de uma nota livre, em tema claro e escuro, no desktop (1440) e no
 * celular (375). Fora do smoke da CI: rodar com `PLAYWRIGHT_TEST_MATCH=spec-321-nota-retida-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { DOCUMENT_LIST_PAGE } from './nfe-workspace/nfe-workspace.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_321_NOTA_RETIDA_PRINTS_DIRECTORY ??
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

const BASE = DOCUMENT_LIST_PAGE.items[0]
const FREE = {
  ...BASE,
  id: '00000000-0000-4000-8000-0000000003a1',
  number: '000899853',
  recipientName: 'Mercado Bom Preço',
}
const RETAINED = {
  ...BASE,
  accessKey: '35190730290856000160550010000000021000000027',
  canhotoRetained: true,
  id: '00000000-0000-4000-8000-0000000003a2',
  number: '000899875',
  recipientName: 'Atacado Sertãozinho',
  tripId: '00000000-0000-4000-8000-0000000000b1',
  tripStatus: 'dispatched',
}

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: Nova viagem oferece a nota com canhoto retido (${theme}, ${viewport})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['fleet.read', 'trip.manage', 'trip.financials', 'invoices.read'],
      })
      await page.route(/\/nfe-documents(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ headers: CORS, status: 204 })
          return
        }
        await route.fulfill({
          body: JSON.stringify({ data: [FREE, RETAINED], page: { nextCursor: null } }),
          contentType: 'application/json',
          headers: CORS,
          status: 200,
        })
      })
      await loginAsLocalUser(page)
      await page.waitForTimeout(600)
      const close = page.getByRole('button', { name: 'Fechar menu' })
      if (await close.isVisible()) await close.dispatchEvent('click')

      await page.getByRole('button', { name: 'Nova viagem' }).click()
      const dialog = page.getByRole('dialog', { name: 'Nova viagem' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Buscar notas' }).click()
      await expect(dialog.getByText('899875')).toBeVisible()
      await expect(dialog.getByText('Canhoto retido', { exact: true })).toBeVisible()
      await dialog.getByText('Canhoto retido', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `nota-retida-nova-viagem-${theme}-${viewport}.png`),
      })
    })
  }
}
