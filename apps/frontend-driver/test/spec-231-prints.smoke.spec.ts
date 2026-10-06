/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 231 (`web.md` §15): o app do motorista no tema claro, nas telas que ele usa. O sistema em
 * claro (`prefers-color-scheme`) acende o tema sem ninguém clicar. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-231-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 231.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { ageQueuedItems, mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/231-o-app-do-motorista-tem-tema-claro/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const SCHEMES = ['light', 'dark'] as const

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0)
  await page.screenshot({ animations: 'disabled', path: resolve(PRINTS_DIRECTORY, name) })
}

for (const scheme of SCHEMES) {
  test(`print: telas do motorista no tema ${scheme} (375)`, async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.emulateMedia({ colorScheme: scheme })
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    const api = await mockDriverTripApi({ page })
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
    await shoot(page, `viagem-${scheme}.png`)

    await page.getByRole('button', { exact: true, name: 'Cheguei' }).click()
    await expect(page.getByRole('button', { exact: true, name: 'Entreguei' })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 520))
    await shoot(page, `parada-${scheme}.png`)

    api.setOffline(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { exact: true, name: 'Entreguei' }).click()
    await ageQueuedItems({ ageMs: 30 * 60 * 60 * 1000, page })
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: 'parado desde' })).toBeVisible()
    await shoot(page, `viagem-com-aviso-${scheme}.png`)

    await page.getByRole('button', { name: /^Fila de envio/u }).click()
    await expect(page.getByRole('button', { name: 'Enviar todos agora' })).toBeVisible()
    await shoot(page, `fila-${scheme}.png`)

    await page.getByRole('button', { name: 'Perfil' }).click()
    await expect(page.getByRole('button', { name: /Usar tema/u })).toBeVisible()
    await shoot(page, `perfil-${scheme}.png`)
  })
}
