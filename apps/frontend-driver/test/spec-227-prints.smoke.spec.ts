/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 227 (`web.md` §15): o item recusado de negócio (409) fica na tela de pendências até o
 * motorista descartar — com aviso e confirmação, e sem prazo de 7 dias. Fora do smoke da CI: roda
 * com `PLAYWRIGHT_TEST_MATCH=spec-227-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 227.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/227-a-fila-nao-apaga-o-que-nao-subiu/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`print: recusado de negócio, descarte com confirmação (375 ${theme})`, async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.emulateMedia({ colorScheme: theme })
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    await mockDriverTripApi({ page })
    await page.route(/\/me\/trips\/current\/documents\/[^/]+\/occurrences$/, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      await route.fulfill({
        body: JSON.stringify({ error: { code: 'TRIP_DOCUMENT_ALREADY_CLOSED', message: 'x' } }),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        status: 409,
      })
    })
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

    await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
    const form = page.getByRole('group', { name: 'Registrar ocorrência' })
    await form.getByRole('radio', { name: /Cliente ausente/u }).click()
    await form.getByRole('button', { exact: true, name: 'Registrar' }).click()

    await page.getByRole('button', { name: /^Fila de envio/u }).click()
    await expect(page.getByText(/Rejeitado pelo servidor/u)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Descartar' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `recusado-com-descartar-375-${theme}.png`),
    })

    await page.getByRole('button', { name: 'Descartar' }).click()
    await expect(page.getByText(/Descartar apaga este item do aparelho/u)).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `recusado-confirmacao-375-${theme}.png`),
    })

    await page.getByRole('button', { name: 'Descartar mesmo assim' }).click()
    await expect(page.getByText('Nada aguardando envio.')).toBeVisible()
  })
}
