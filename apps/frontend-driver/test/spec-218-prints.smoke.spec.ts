/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 218 T23 (`web.md` §15): os prints da revisão de design do botão único de ocorrência, em
 * 375 px, nos dois temas — um tipo `required` (com a captura da foto) e um tipo sem foto, na mesma
 * lista. Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-218-prints.smoke.spec.ts` (com
 * o bypass de fumaça, como o smoke da app) e grava os PNGs ao lado da spec 218.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/218-o-motorista-nao-escapa-do-comprovante/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const PHOTO = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  mimeType: 'image/png',
  name: 'foto.png',
} as const

/** A barra de navegação de baixo é fixa: sem centralizar, o fim do formulário sai coberto. */
async function centerInView(locator: Locator): Promise<Locator> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  /** O ponteiro parado sobre o último toque pintaria o hover no print — o motorista usa o dedo. */
  await locator.page().mouse.move(0, 0)
  return locator
}

async function openOccurrenceForm(page: Page, theme: (typeof THEMES)[number]): Promise<Locator> {
  await page.setViewportSize(MOBILE)
  await page.emulateMedia({ colorScheme: theme })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
  return page.getByRole('group', { name: 'Registrar ocorrência' })
}

async function measureOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

for (const theme of THEMES) {
  test(`print: tipo obrigatório e tipo sem foto na mesma lista (375 ${theme})`, async ({
    page,
  }) => {
    const form = await openOccurrenceForm(page, theme)
    const types = form.getByRole('radiogroup', { name: 'Qual ocorrência?' })

    await types.getByRole('radio', { name: /Cobrança inesperada/u }).click()
    await expect(form.getByText('Para registrar, falta: a foto.')).toBeVisible()
    await (
      await centerInView(form)
    ).screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `t23-obrigatoria-sem-foto-375-${theme}.png`),
    })

    const chooser = page.waitForEvent('filechooser')
    await form.getByRole('button', { name: /^Tirar foto/u }).click()
    await (await chooser).setFiles(PHOTO)
    await expect(form.getByText('Foto da ocorrência anexada')).toBeVisible()
    await expect(form.getByRole('button', { exact: true, name: 'Registrar' })).toBeEnabled()
    await (
      await centerInView(form)
    ).screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `t23-obrigatoria-com-foto-375-${theme}.png`),
    })

    await types.getByRole('radio', { name: /Cliente ausente/u }).click()
    await expect(form.getByRole('button', { name: /^Tirar foto/u })).toHaveCount(0)
    await expect(form.getByRole('button', { exact: true, name: 'Registrar' })).toBeEnabled()
    await (
      await centerInView(form)
    ).screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `t23-sem-foto-375-${theme}.png`),
    })

    expect(await measureOverflow(page)).toBeLessThanOrEqual(0)
  })
}

/** D4: "Ocorrência" antes do "Cheguei" (sozinho na linha) e depois (ao lado de Entreguei). */
test('print: o botão da nota antes e depois do Cheguei (375 dark)', async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page })
  await loginAsLocalUser(page)
  const occurrence = page.getByRole('button', { exact: true, name: 'Ocorrência' }).first()
  const row = page.locator('li', { has: occurrence }).last()
  await (
    await centerInView(row)
  ).screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 't23-nota-antes-do-cheguei-375-dark.png'),
  })

  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect(page.getByRole('button', { exact: true, name: 'Entreguei' })).toBeVisible()
  await (
    await centerInView(row)
  ).screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 't23-nota-depois-do-cheguei-375-dark.png'),
  })
  expect(await measureOverflow(page)).toBeLessThanOrEqual(0)
})
