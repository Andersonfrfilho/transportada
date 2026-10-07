/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 229 (`web.md` §15): a faixa que avisa o que está parado há mais de um dia, e a data nos itens
 * antigos da tela de pendências. O item é envelhecido no IndexedDB do próprio app (a fila é um
 * registro só, `field-reports/queue`). Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-229-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 229.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { ageQueuedItems, mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/229-a-fila-avisa-o-que-esta-parado-ha-dias/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`print: faixa do que está parado há dias e a data na fila (375 ${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.emulateMedia({ colorScheme: theme })
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    const api = await mockDriverTripApi({ page })
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

    api.setOffline(true)
    await page.getByRole('button', { name: 'Cheguei' }).click()
    await expect(page.getByRole('button', { name: /^Fila de envio/u })).toBeVisible()
    await ageQueuedItems({ ageMs: 52 * 60 * 60 * 1000, page })
    await page.reload()

    const notice = page.getByRole('alert').filter({ hasText: 'parado desde' })
    await expect(notice).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `faixa-parado-ha-dias-375-${theme}.png`),
    })

    await notice.click()
    await expect(page.getByRole('button', { name: 'Enviar todos agora' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `fila-com-data-375-${theme}.png`),
    })
  })
}
