/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T4: os prints da revisão de design (`web.md` §15) — o detalhe da ocorrência com o botão "Avisar a contratante"
 * e o diálogo de confirmação, em tema claro e escuro, no desktop (1440) e no celular (375). Fora do smoke da CI:
 * rodar com `PLAYWRIGHT_TEST_MATCH=spec-324-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
} from './spec-183-prints-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_324_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/324-avisar-contratante-manual/prints')
const VIEWPORTS = [
  ['desktop', { height: 1000, width: 1440 }],
  ['mobile', { height: 844, width: 375 }],
] as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

async function fulfill(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS,
    status: 200,
  })
}

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: botão e confirmação (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockOccurrenceDetailPrintsApi({
        page,
        permissions: ['fleet.read', 'occurrences.resolve', 'settings.manage'],
      })
      await page.route(/\/trip-occurrences\/[^/]+\/contractor-notice$/, (route) =>
        fulfill(route, {
          data: {
            channel: 'email',
            preview: {
              bodyText:
                'Prezados,\n\nO motorista encontrou o local de entrega fechado na NF 4512/1.\nPedimos orientação para seguir com a entrega.',
              subject: 'Ocorrência — NF 4512/1',
            },
            recipientCount: 2,
            status: 'available',
          },
        }),
      )
      await loginAsLocalUser(page)
      await page.evaluate((path) => {
        window.history.pushState({}, '', path)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
      if (viewport === 'mobile')
        await page
          .getByRole('tablist', { name: 'Partes da ocorrência' })
          .getByRole('tab', { name: 'Contratante' })
          .click()
      await page.getByRole('button', { name: 'Ver detalhes' }).first().click()
      const button = page.getByRole('button', { name: 'Avisar a contratante' })
      await expect(button).toBeVisible()
      await button.scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(PRINTS_DIRECTORY, `botao-${theme}-${viewport}.png`) })
      await button.click()
      const dialog = page.getByRole('dialog', { name: 'Avisar a contratante' })
      await expect(dialog.getByText('Ocorrência — NF 4512/1')).toBeVisible()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `confirmacao-${theme}-${viewport}.png`),
      })
    })
  }
}
