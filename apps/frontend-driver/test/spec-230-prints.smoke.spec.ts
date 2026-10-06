/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 230 (`web.md` §15): despachar sem sinal fica como pendência de envio e libera o campo. Fora do
 * smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-230-prints.smoke.spec.ts` e grava os PNGs ao lado
 * da spec 230.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/230-o-despacho-sem-rede-fica-pendente/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`print: despacho sem sinal fica pendente e libera o campo (375 ${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.emulateMedia({ colorScheme: theme })
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    const api = await mockDriverTripApi({ page, scenario: { startsPlanned: true } })
    await loginAsLocalUser(page)
    const dispatch = page.getByRole('button', { name: 'Despachar viagem' })
    await expect(dispatch).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `antes-do-despacho-375-${theme}.png`),
    })

    api.setOffline(true)
    await dispatch.click()
    await expect(page.getByText(/Início da viagem aguardando envio/u)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cheguei' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `despacho-pendente-375-${theme}.png`),
    })

    await page.getByRole('button', { name: /^Fila de envio/u }).click()
    await expect(page.getByText('Iniciar viagem')).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `fila-com-despacho-375-${theme}.png`),
    })
  })
}
