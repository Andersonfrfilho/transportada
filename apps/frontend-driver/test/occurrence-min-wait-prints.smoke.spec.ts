/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (spec 315 T7b): o tipo com espera mínima desabilitado, antes do "Cheguei" e com o
 * contador depois. Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=occurrence-min-wait-prints.smoke.spec.ts`
 * e o bypass de fumaça; grava em `PRINTS_DIR` (padrão `prints/`).
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIR ?? resolve(process.cwd(), 'prints')
const THEMES = ['light', 'dark'] as const
const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const

for (const theme of THEMES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test(`print: espera mínima (${device} ${theme})`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await page.context().grantPermissions(['geolocation'])
      await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
      await mockDriverTripApi({ page })
      await page.route(/\/me\/trips\/current\/occurrence-types$/, async (route) => {
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ headers, status: 204 })
          return
        }
        await route.fulfill({
          body: JSON.stringify({
            data: [
              {
                attachmentMode: 'optional',
                flow: 'stop',
                id: '00000000-0000-4000-8000-0000000000a1',
                name: 'Doca interditada',
                stopKind: 'dock_closed',
              },
              {
                attachmentMode: 'off',
                flow: 'stop',
                id: '00000000-0000-4000-8000-0000000000a2',
                minWaitAfterArrivalMinutes: 30,
                name: 'Espera longa',
                stopKind: 'dock_closed',
              },
            ],
          }),
          contentType: 'application/json',
          headers,
        })
      })
      await loginAsLocalUser(page)

      const open = async (): Promise<void> => {
        await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
        const wait = page.getByRole('radio', { name: /Espera longa/u })
        await expect(wait).toBeDisabled()
      }

      await open()
      const types = page.getByRole('radiogroup', { name: 'Qual ocorrência?' })
      await expect(types.getByText('Marque "Cheguei" primeiro')).toBeVisible()
      await types.scrollIntoViewIfNeeded()
      await types.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `espera-antes-${device}-${theme}.png`),
      })

      await page.getByRole('button', { name: 'Cheguei' }).click()
      await expect(types.getByText(/faltam? \d+ min/u)).toBeVisible({ timeout: 20_000 })
      await types.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `espera-contador-${device}-${theme}.png`),
      })
    })
  }
}
