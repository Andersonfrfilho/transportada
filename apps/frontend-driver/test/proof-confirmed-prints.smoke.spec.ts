/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (`web.md` §15) do comprovante que o servidor já tem: o estado que o
 * usuário fotografou em 01/10, com a frase vazando de um quadrado de 4rem. Fora do smoke da CI —
 * roda com `PLAYWRIGHT_TEST_MATCH=proof-confirmed-prints.smoke.spec.ts` e o bypass de fumaça, e
 * grava os PNGs em `PRINTS_DIR` (por padrão `prints/` dentro da app).
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIR ?? resolve(process.cwd(), 'prints')
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const PHOTO = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  mimeType: 'image/png',
  name: 'canhoto.png',
} as const

const REQUIRED_PHOTO_PROOF = {
  settlesDeliveries: true,
  stopDeliveryProof: {
    photo: 'required',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'optional',
  },
} as const

async function openTrip(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize(MOBILE)
  await page.emulateMedia({ colorScheme: theme })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page, scenario: REQUIRED_PHOTO_PROOF })
  await loginAsLocalUser(page)
}

for (const theme of THEMES) {
  test(`print: o comprovante que o servidor já tem (375 ${theme})`, async ({ page }) => {
    await openTrip(page, theme)
    await page.getByRole('button', { name: 'Cheguei' }).click()

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /^Tirar foto/u }).click()
    await (await chooser).setFiles(PHOTO)
    await page.getByRole('button', { name: 'Usar sem recorte' }).click()
    const confirm = page.getByRole('button', { exact: true, name: 'Confirmar entrega' })
    await expect(confirm).toBeEnabled()
    await confirm.click()

    /** A foto sai do aparelho com a drenagem; a recarga é o que devolve a tela sem cópia local. */
    await expect(page.getByText('Entregue às')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(5_000)
    await page.reload()

    const item = page.locator('li', { hasText: 'Mercearia do Centro' }).last()
    const frame = item.getByText('Comprovante já enviado')
    await expect(frame).toBeVisible({ timeout: 20_000 })
    await item.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await page.mouse.move(0, 0)
    await item.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `comprovante-enviado-375-${theme}.png`),
    })

    /** A moldura acompanha a largura dos botões: nada de quadrado de 4rem com a frase por fora. */
    const [frameBox, attachBox] = await Promise.all([
      item.locator('p:has-text("Canhoto") ~ div').first().boundingBox(),
      item.getByRole('button', { exact: true, name: 'Anexar' }).boundingBox(),
    ])
    expect(Math.abs((frameBox?.width ?? 0) - (attachBox?.width ?? 0))).toBeLessThanOrEqual(1)
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
      .toBe(true)
  })
}
