/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 226 T3.3 (`web.md` §15): a ocorrência de nota **sem foto** agora passa pela fila. O print
 * mostra o retorno visível do cartão da nota sem sinal ("na fila") e depois que o sinal volta
 * ("enviada"), em 375 px, nos dois temas. Fora do smoke da CI — roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-226-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 226.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/226-a-fila-do-motorista-nao-trava-com-o-servidor-fora/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`print: ocorrência de nota sem foto, sem sinal e com sinal (375 ${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.emulateMedia({ colorScheme: theme })
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    const api = await mockDriverTripApi({ page })
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

    await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
    const form = page.getByRole('group', { name: 'Registrar ocorrência' })
    await form.getByRole('radio', { name: /Cliente ausente/u }).click()
    await form.getByRole('textbox').fill('Portão sem número, ninguém atendeu')

    api.setOffline(true)
    await form.getByRole('button', { exact: true, name: 'Registrar' }).click()
    const queued = page.getByText('Ocorrência na fila — sobe quando o sinal voltar.')
    await expect(queued).toBeVisible()
    const queuedRow = page.locator('li[class*="_document_"]', { has: queued })
    await queuedRow.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await page.mouse.move(0, 0)
    await queuedRow.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `nota-sem-foto-na-fila-375-${theme}.png`),
    })

    api.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const sent = page.getByText('Ocorrência enviada.')
    await expect(sent).toBeVisible()
    const sentRow = page.locator('li[class*="_document_"]', { has: sent })
    await sentRow.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await page.mouse.move(0, 0)
    await sentRow.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `nota-sem-foto-enviada-375-${theme}.png`),
    })

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
  })
}
