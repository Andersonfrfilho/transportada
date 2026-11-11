/* Copyright (c) 2026 Ada Technology. MIT License. */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockNfeWorkspaceApi } from './nfe-workspace-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

/**
 * Revisão de design do leitor de "Vincular nota" (`web.md` §15). Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=vincular-nota-prints.smoke.spec.ts` e grava em `VINCULAR_NOTA_PRINTS_DIRECTORY`.
 */
const PRINTS_DIRECTORY =
  process.env.VINCULAR_NOTA_PRINTS_DIRECTORY ?? resolve(process.cwd(), 'test-results/vincular-nota')
const THEMES = ['dark', 'light'] as const
const VIEWPORTS = [
  ['mobile', { height: 844, width: 375 }],
  ['desktop', { height: 900, width: 1440 }],
] as const

async function navigateTo(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: Vincular nota — ${label} ${theme}`, async ({ page }) => {
      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await mockTripWorkspaceApi({
        mode: 'dispatch-flow',
        page,
        permissions: ['trip.report-on-behalf', 'trip.manage'],
      })
      await loginAsLocalUser(page)
      await navigateTo(page, `/trips/${TRIP_ID}`)
      const title = page.getByRole('heading', { name: 'Vincular nota' })
      await expect(title).toBeVisible()
      const panel = page.locator('div:has(> h3:text("Vincular nota"))').first()
      await panel.scrollIntoViewIfNeeded()
      await panel.screenshot({
        path: resolve(PRINTS_DIRECTORY, `vincular-nota-${label}-${theme}.png`),
      })
    })
  }
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: Workspace NF-e, cabeçalho — ${label} ${theme}`, async ({ page }) => {
      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await mockNfeWorkspaceApi({
        documentCount: 2,
        page,
        permissions: ['invoices.read', 'invoices.import', 'cte.manage', 'settings.manage'],
      })
      await loginAsLocalUser(page)
      const header = page.locator('header').filter({ hasText: 'Workspace NF-e' }).first()
      await expect(header.getByRole('button', { name: 'Importar por bip' })).toBeVisible()
      await header.screenshot({
        path: resolve(PRINTS_DIRECTORY, `nfe-importar-por-bip-${label}-${theme}.png`),
      })
    })
  }
}
