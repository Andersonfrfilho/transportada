/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 179 T402 (`web.md` §15): os prints da revisão de design do "Não entreguei" com foto e do
 * canhoto com três botões, em 375 px e no desktop, nos dois temas. Fora do smoke da CI — roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-179-prints.smoke.spec.ts` (com o bypass de fumaça, como o smoke da
 * app) e grava os PNGs ao lado da spec 179, que é onde a evidência mora.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi, type DriverTripProofScenario } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/179-a-recusa-sai-com-foto/prints')
const VIEWPORTS = [
  ['375', { height: 812, width: 375 }],
  ['desktop', { height: 900, width: 1280 }],
] as const
const THEMES = ['dark', 'light'] as const

/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const PHOTO = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  mimeType: 'image/png',
  name: 'foto.png',
} as const

/**
 * A barra de navegação de baixo é fixa: sem centralizar, o fim do elemento sai coberto por ela no
 * print (o layout está certo — medido: o botão mais baixo cabe dentro do cartão).
 */
async function centerInView(locator: Locator): Promise<Locator> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  return locator
}

async function openDriverApp(
  input: Readonly<{
    page: Page
    scenario?: DriverTripProofScenario
    theme: (typeof THEMES)[number]
    viewport: Readonly<{ height: number; width: number }>
  }>,
) {
  await input.page.setViewportSize(input.viewport)
  await input.page.emulateMedia({ colorScheme: input.theme })
  await input.page.context().grantPermissions(['geolocation'])
  await input.page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  const api = await mockDriverTripApi({
    page: input.page,
    ...(input.scenario === undefined ? {} : { scenario: input.scenario }),
  })
  await loginAsLocalUser(input.page)
  await expect(input.page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  return api
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: "Não entreguei" vazio e completo (${label} ${theme})`, async ({ page }) => {
      await openDriverApp({ page, theme, viewport })
      // Pedido do usuário (25/09): "Não entreguei" só existe depois de "Cheguei".
      await page.getByRole('button', { name: 'Cheguei' }).click()
      await page.getByRole('button', { exact: true, name: 'Não entreguei' }).click()
      const form = page.locator('fieldset', { hasText: 'Por que não entregou?' })
      await expect(form.getByText(/Para confirmar, falta:/u)).toBeVisible()
      await (
        await centerInView(form)
      ).screenshot({
        path: resolve(PRINTS_DIRECTORY, `nao-entreguei-vazio-${label}-${theme}.png`),
      })
      /** A barra de baixo é fixa: o confirmar desabilitado e o "falta" ficam no meio da tela. */
      await form
        .getByRole('button', { exact: true, name: 'Confirmar' })
        .evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `nao-entreguei-confirmar-bloqueado-${label}-${theme}.png`),
      })

      await form.getByRole('radio', { name: 'Recusa' }).click()
      await form.getByRole('radio', { name: 'Cliente ausente' }).click()
      const chooser = page.waitForEvent('filechooser')
      await form.getByRole('button', { name: /^Tirar foto/u }).click()
      await (await chooser).setFiles(PHOTO)
      await expect(form.getByText('Foto da ocorrência anexada')).toBeVisible()
      await form.getByRole('textbox').fill('Cliente pediu para voltar amanhã.')
      await expect(form.getByRole('button', { exact: true, name: 'Confirmar' })).toBeEnabled()
      await (
        await centerInView(form)
      ).screenshot({
        path: resolve(PRINTS_DIRECTORY, `nao-entreguei-completo-${label}-${theme}.png`),
      })
    })

    test(`print: cartão "na fila" e "enviada" (${label} ${theme})`, async ({ page }) => {
      const api = await openDriverApp({ page, theme, viewport })
      api.setOffline(true)
      // Pedido do usuário (25/09): "Não entreguei" só existe depois de "Cheguei".
      await page.getByRole('button', { name: 'Cheguei' }).click()
      await page.getByRole('button', { exact: true, name: 'Não entreguei' }).click()
      const form = page.locator('fieldset', { hasText: 'Por que não entregou?' })
      await form.getByRole('radio', { name: 'Recusa' }).click()
      await form.getByRole('radio', { name: 'Cliente ausente' }).click()
      const chooser = page.waitForEvent('filechooser')
      await form.getByRole('button', { name: /^Tirar foto/u }).click()
      await (await chooser).setFiles(PHOTO)
      await expect(form.getByText('Foto da ocorrência anexada')).toBeVisible()
      await form.getByRole('button', { exact: true, name: 'Confirmar' }).click()

      const queued = page.getByText('Ocorrência com foto na fila — sobe quando o sinal voltar.')
      await expect(queued).toBeVisible()
      await (
        await centerInView(page.locator('li', { has: queued }).last())
      ).screenshot({ path: resolve(PRINTS_DIRECTORY, `cartao-na-fila-${label}-${theme}.png`) })

      api.setOffline(false)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      const sent = page.getByText('Ocorrência com foto enviada.')
      await expect(sent).toBeVisible()
      await (
        await centerInView(page.locator('li', { has: sent }).last())
      ).screenshot({ path: resolve(PRINTS_DIRECTORY, `cartao-enviada-${label}-${theme}.png`) })
    })

    test(`print: canhoto com três botões e a foto anexada (${label} ${theme})`, async ({
      page,
    }) => {
      await openDriverApp({
        page,
        scenario: {
          settlesDeliveries: true,
          stopDeliveryProof: {
            photo: 'required',
            receiverDocument: 'off',
            receiverName: 'optional',
            signature: 'optional',
          },
        },
        theme,
        viewport,
      })
      // Pedido do usuário (25/09): "Entreguei" só existe depois de "Cheguei".
      await page.getByRole('button', { name: 'Cheguei' }).click()
      await page.getByRole('button', { exact: true, name: 'Entreguei' }).click()
      const item = page.locator('li', { hasText: 'Mercearia do Centro' }).last()
      await expect(item.getByRole('button', { exact: true, name: 'Anexar' })).toBeVisible()
      await (
        await centerInView(item)
      ).screenshot({
        path: resolve(PRINTS_DIRECTORY, `canhoto-botoes-${label}-${theme}.png`),
      })

      const chooser = page.waitForEvent('filechooser')
      await item.getByRole('button', { name: /^Tirar foto/u }).click()
      await (await chooser).setFiles(PHOTO)
      await page.getByRole('button', { name: 'Usar sem recorte' }).click()
      await expect(item.getByText('Foto do canhoto anexada')).toBeVisible()
      await (
        await centerInView(item)
      ).screenshot({
        path: resolve(PRINTS_DIRECTORY, `canhoto-anexada-${label}-${theme}.png`),
      })
    })
  }
}
