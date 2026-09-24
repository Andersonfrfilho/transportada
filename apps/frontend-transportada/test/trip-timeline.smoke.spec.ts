/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T8 (RF6) / T10: a seção "Linha do tempo" no detalhe da viagem — os oito `kind`s do D5 em
 * duas páginas, do mais recente para o mais antigo, e os prints da revisão de design (1280 e 375,
 * claro e escuro), cada um de uma carga nova da página no tamanho e tema do print.
 */
import { mkdirSync } from 'node:fs'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'
import { mockTripTimelineApi } from './trip-timeline-smoke.helper'

const PRINTS_DIRECTORY = new URL(
  '../../../specs/158-linha-do-tempo-da-viagem/prints/',
  import.meta.url,
)
mkdirSync(PRINTS_DIRECTORY, { recursive: true })

const AUTHORSHIP = 'por Marina Alves (escritório) pelo motorista João Pereira'

const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const

type Theme = 'dark' | 'light'

async function openTripTimeline(
  input: Readonly<{ page: Page; theme: Theme; viewport: keyof typeof VIEWPORTS }>,
): Promise<Readonly<{ failures: () => readonly unknown[]; section: Locator }>> {
  const { page } = input
  await page.setViewportSize(VIEWPORTS[input.viewport])
  await page.emulateMedia({ colorScheme: input.theme })
  const api = await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'trip.report-on-behalf'],
  })
  await mockTripTimelineApi(page)
  await loginAsLocalUser(page)

  /**
   * ⚠️ Nunca `page.goto('/trips/:id')` — a SPA não tem router de servidor, e o `goto` bateria na
   * mesma URL do mock (ver a mesma ressalva em `field-delivery.smoke.spec.ts`).
   */
  await page.evaluate((tripId) => {
    window.history.pushState({}, '', `/trips/${tripId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, TRIP_ID)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const section = page.getByRole('region', { name: 'Linha do tempo' })
  await expect(section).toBeVisible()
  return { failures: api.failures, section }
}

test('a linha do tempo mostra os oito tipos de evento, do mais recente, e carrega mais', async ({
  page,
}) => {
  const { failures, section } = await openTripTimeline({ page, theme: 'dark', viewport: 'desktop' })

  await expect(section.getByText('Nota 456/1 separada')).toBeVisible()
  await expect(section.getByText('Ocorrência em Nota 456/1: Avaria')).toBeVisible()
  await expect(section.getByText('Ocorrência: Avaria')).toBeVisible()
  await expect(section.getByText('Nota 456/1 devolvida')).toBeVisible()
  await expect(section.getByText(AUTHORSHIP, { exact: true })).toHaveCount(4)

  const loadMore = section.getByRole('button', { name: 'Carregar mais' })
  const loadMoreBox = await loadMore.boundingBox()
  expect(loadMoreBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  await loadMore.click()

  await expect(section.getByText('Nota 456/1 entregue')).toBeVisible()
  await expect(section.getByText('Chegada na parada 1')).toBeVisible()
  await expect(section.getByText('Rota iniciada')).toBeVisible()
  await expect(section.getByText('Viagem despachada')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Carregar mais' })).toHaveCount(0)

  /*
   * Spec 180 RF16: fechado, o evento mostra só título, hora e autoria — motivo da devolução e
   * observação da ocorrência vivem na expansão. O smoke nasceu quando tudo era sempre visível.
   */
  await expect(section.getByText('Motivo da devolução: Cliente ausente')).toHaveCount(0)

  /*
   * Sempre o primeiro ainda fechado, re-consultando: uma lista capturada de uma vez fica obsoleta
   * no primeiro clique, porque `aria-expanded` muda e os índices andam.
   */
  const collapsed = section.getByRole('button', { expanded: false })
  for (let remaining = await collapsed.count(); remaining > 0; remaining -= 1) {
    await collapsed.first().click()
  }
  await expect(section.getByText('Motivo da devolução: Cliente ausente')).toBeVisible()
  await expect(section.getByText('Caixa amassada')).toHaveCount(2)

  const times = await section
    .locator('li time')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime') ?? ''))
  expect(times).toEqual([...times].sort().reverse())

  expect(failures()).toEqual([])
})

for (const viewport of ['desktop', 'mobile'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`print da linha do tempo — ${viewport} ${theme}`, async ({ page }) => {
      const { failures, section } = await openTripTimeline({ page, theme, viewport })
      await section.getByRole('button', { name: 'Carregar mais' }).click()
      await expect(section.getByText('Viagem despachada')).toBeVisible()

      if (viewport === 'mobile') {
        const sidebarRight = await page
          .locator('.application-sidebar')
          .evaluate((node) => node.getBoundingClientRect().right)
        expect(sidebarRight).toBeLessThanOrEqual(0)
      }

      await section.scrollIntoViewIfNeeded()
      await section.screenshot({
        path: new URL(`t10-timeline-${viewport}-${theme}.png`, PRINTS_DIRECTORY).pathname,
      })
      expect(failures()).toEqual([])
    })
  }
}
