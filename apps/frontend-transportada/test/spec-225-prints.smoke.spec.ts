/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 225 (`web.md` §15): os prints da revisão de design da linha da nota (gasto, lucro, margem,
 * imposto e critério) e do painel "A conta desta viagem" com previsto e fechado lado a lado. Fora do
 * smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-225-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/225-.../prints/`, que é onde a evidência mora.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev`: o app redireciona para a URL
 * do `.env` (53000), então preview em porta alternativa devolve a árvore de outra sessão. Confira
 * `window.location.href` se a foto parecer de outra versão.
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/225-cada-nota-diz-quanto-rendeu-e-quanto-gastou/prints',
)
const VIEWPORTS = [
  { height: 900, label: '1280', width: 1280 },
  { height: 844, label: '375', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const TRIP_PERMISSIONS = ['trip.read', 'trip.manage', 'trip.financials', 'fleet.read'] as const

function printPath(name: string, width: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${width}-${theme}.png`)
}

async function openTripDetail(
  input: Readonly<{
    mode: 'document-cost' | 'document-cost-open'
    page: Page
    theme: Theme
    viewport: (typeof VIEWPORTS)[number]
  }>,
): Promise<void> {
  const { mode, page, theme, viewport } = input
  await page.setViewportSize({ height: viewport.height, width: viewport.width })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode, page, permissions: [...TRIP_PERMISSIONS] })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
}

async function expectNothingEscapes(section: Locator): Promise<void> {
  const escapees = await section.evaluate((element) => {
    const limit = element.getBoundingClientRect().right
    return Array.from(element.querySelectorAll('*'))
      .map((child) => ({ box: child.getBoundingClientRect(), child }))
      .filter(
        ({ box, child }) =>
          box.width > 0 && box.right > limit + 1 && child.closest('[class*=tableScroll]') === null,
      )
      .map(
        ({ box, child }) =>
          `${child.tagName}.${child.className} escapa ${Math.round(box.right - limit)}px — "${(child.textContent ?? '').slice(0, 40)}"`,
      )
  })

  expect(escapees, 'elementos ultrapassando a borda do recorte').toEqual([])
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { innerWidth, scrollWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(scrollWidth, 'a página não pode ser mais larga que a janela').toBeLessThanOrEqual(
    innerWidth,
  )
}

function financialPanel(page: Page): Locator {
  return page
    .getByRole('heading', { level: 2, name: 'A conta desta viagem' })
    .locator('xpath=ancestor::section[1]')
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`print da conta por nota e do previsto/fechado — ${viewport.label} ${theme}`, async ({
      page,
    }) => {
      await openTripDetail({ mode: 'document-cost', page, theme, viewport })

      const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
      await expect(stops.getByText(/do trecho/iu)).toHaveCount(0)
      await stops.getByRole('button', { name: 'Detalhes da nota' }).first().click()
      await expect(stops.getByText(/do trecho/iu).first()).toBeVisible()
      await expect(stops.getByText(/rateio da viagem/iu).first()).toBeVisible()
      await expectNothingEscapes(stops)
      await stops.screenshot({
        path: printPath('spec-225-notas-por-parada', viewport.label, theme),
      })

      const panel = financialPanel(page)
      await expect(panel).toBeVisible()
      await expectNothingEscapes(panel)
      await expectNoHorizontalOverflow(page)
      await panel.screenshot({ path: printPath('spec-225-painel-da-conta', viewport.label, theme) })
    })

    test(`print da ausência — roteiro não calculado e fechado inexistente — ${viewport.label} ${theme}`, async ({
      page,
    }) => {
      await openTripDetail({ mode: 'document-cost-open', page, theme, viewport })

      const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
      await stops.getByRole('button', { name: 'Detalhes da nota' }).first().click()
      await expectNothingEscapes(stops)
      await stops.screenshot({ path: printPath('spec-225-ausencia-notas', viewport.label, theme) })

      const panel = financialPanel(page)
      await expect(panel).toBeVisible()
      await expectNothingEscapes(panel)
      await expectNoHorizontalOverflow(page)
      await panel.screenshot({ path: printPath('spec-225-ausencia-painel', viewport.label, theme) })
    })
  }
}
