/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T8 (RF6): a seção "Linha do tempo" no detalhe da viagem — os oito `kind`s do D5 na
 * primeira página, e "carregar mais" trazendo a segunda com `nextCursor: null`.
 */
import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'
import { mockTripTimelineApi } from './trip-timeline-smoke.helper'

const PRINTS_DIRECTORY = new URL(
  '../../../specs/158-linha-do-tempo-da-viagem/prints/',
  import.meta.url,
)
mkdirSync(PRINTS_DIRECTORY, { recursive: true })

test('a linha do tempo mostra os oito tipos de evento e carrega mais', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 })
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

  await expect(section.getByText('Viagem despachada')).toBeVisible()
  await expect(section.getByText('Situação alterada para Em rota de entrega')).toBeVisible()
  await expect(section.getByText('Chegada na parada 1')).toBeVisible()
  await expect(section.getByText('Nota 456/1 entregue')).toBeVisible()
  await expect(
    section.getByText('registrado por Marina Alves (escritório) pelo motorista João Pereira'),
  ).toHaveCount(4)

  const loadMore = section.getByRole('button', { name: 'Carregar mais' })
  await expect(loadMore).toBeVisible()
  await loadMore.click()

  await expect(section.getByText('Nota 456/1 devolvida')).toBeVisible()
  await expect(section.getByText('Ocorrência: Avaria')).toBeVisible()
  await expect(section.getByText('Ocorrência em Nota 456/1: Avaria')).toBeVisible()
  await expect(section.getByText('Nota 456/1 — Separada')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Carregar mais' })).toHaveCount(0)
  await expect(section.getByText('Motivo da devolução: Cliente ausente')).toBeVisible()
  await expect(section.getByText('Caixa amassada')).toHaveCount(2)

  await section.scrollIntoViewIfNeeded()
  await section.screenshot({
    path: new URL('t8-timeline-desktop.png', PRINTS_DIRECTORY).pathname,
  })

  await page.setViewportSize({ height: 812, width: 375 })
  await expect(section).toBeVisible()
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({
    path: new URL('t8-timeline-mobile.png', PRINTS_DIRECTORY).pathname,
  })

  expect(api.failures()).toEqual([])
})
