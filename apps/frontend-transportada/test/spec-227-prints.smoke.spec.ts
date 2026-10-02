/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 (`web.md` §15): os prints intermediários do acordeão da nota — as notas fechadas com os
 * selos do cabeçalho, uma nota entregue aberta e uma não entregue aberta. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-227-prints.smoke.spec.ts` e grava os PNGs em `specs/227-.../prints/`.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev` (ver `spec-181-prints`): o app
 * redireciona para a URL do `.env`, então preview em porta alternativa devolve a árvore de outra sessão.
 */
import { resolve } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/227-a-nota-se-abre-inteira/prints')
const VIEWPORTS = [
  { height: 900, label: '1280', width: 1280 },
  { height: 844, label: '375', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const TRIP_PERMISSIONS = ['trip.read', 'trip.manage', 'trip.financials', 'fleet.read'] as const
const DELIVERED_WITH_OCCURRENCE = /^000124\/1/u
const DELIVERED_AWAY = /^000125\/1/u
const NOT_DELIVERED = /^000126\/1/u

function printPath(name: string, width: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `spec-227-${name}-${width}-${theme}.png`)
}

async function openTripDetail(
  input: Readonly<{ page: Page; theme: Theme; viewport: (typeof VIEWPORTS)[number] }>,
): Promise<Locator> {
  const { page, theme, viewport } = input
  await page.setViewportSize({ height: viewport.height, width: viewport.width })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'note-accordion', page, permissions: [...TRIP_PERMISSIONS] })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
  const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
  await expect(stops.getByRole('button', { name: DELIVERED_WITH_OCCURRENCE })).toBeVisible()
  return stops
}

function noteRow(stops: Locator, name: RegExp): Locator {
  return stops.locator('li[id^="trip-timeline-document-"]').filter({
    has: stops.page().getByRole('button', { name }),
  })
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

async function openNote(stops: Locator, name: RegExp): Promise<Locator> {
  const toggle = stops.page().getByRole('button', { name })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const row = noteRow(stops, name)
  /** As miniaturas resolvem antes do print: esqueleto no PNG não é revisão de design. */
  await expect(row.getByLabel('Carregando a imagem do comprovante')).toHaveCount(0)
  await row.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await stops.page().mouse.move(0, 0)
  return row
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const suffix = `${viewport.label} ${theme}`

    test(`print das notas fechadas com os selos — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      for (const toggle of await stops.locator('button[aria-expanded]').all()) {
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      }
      await expectNothingEscapes(stops)
      await expectNoHorizontalOverflow(page)
      await stops.screenshot({ path: printPath('notas-fechadas', viewport.label, theme) })
    })

    test(`print da nota entregue aberta — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      await expect(row.getByText('Caixa 3 chegou com amassado').first()).toBeVisible()
      await expectNothingEscapes(row)
      await expectNoHorizontalOverflow(page)
      await row.screenshot({ path: printPath('nota-aberta-entregue', viewport.label, theme) })
    })

    test(`print da nota pendente aberta — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      const row = await openNote(stops, NOT_DELIVERED)
      await expect(row.getByText('Portaria fechada').first()).toBeVisible()
      await expectNothingEscapes(row)
      await expectNoHorizontalOverflow(page)
      await row.screenshot({ path: printPath('nota-aberta-pendente', viewport.label, theme) })
    })
  }
}

test('abrir uma nota fecha a anterior — só uma fica aberta', async ({ page }) => {
  const stops = await openTripDetail({ page, theme: 'dark', viewport: VIEWPORTS[1] })
  const first = stops.getByRole('button', { name: DELIVERED_WITH_OCCURRENCE })
  const second = stops.getByRole('button', { name: DELIVERED_AWAY })

  await first.click()
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await second.click()
  await expect(second).toHaveAttribute('aria-expanded', 'true')
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await expect(stops.locator('button[aria-expanded="true"]')).toHaveCount(1)
})
