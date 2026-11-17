/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317: prints do bloco "Cobrança no recebimento" no detalhe da ocorrência de parada (valor, quem pagou,
 * PIX do motorista e as fotos da placa e do extrato). Fora do smoke da CI: roda por
 * `PLAYWRIGHT_TEST_MATCH` e só grava com `PLAYWRIGHT_SAVE_PRINTS=true`.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  mockOccurrenceDetailPrintsApi,
  STOP_OCCURRENCE,
  STOP_OCCURRENCE_ID,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/317-cobranca-no-recebimento-vai-para-acertos/prints',
)
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 375 },
} as const

function photo(label: string): string {
  return `http://localhost:53000/smoke-photo/${encodeURIComponent(label)}.svg`
}

async function open(page: Page): Promise<void> {
  await page.route(/\/smoke-photo\//u, async (route) => {
    const label = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').pop() ?? '',
    ).replace('.svg', '')
    const body = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#cbd5e1"/><text x="160" y="125" font-size="20" text-anchor="middle" fill="#334155">${label}</text></svg>`
    return route.fulfill({ body, contentType: 'image/svg+xml' })
  })
  await mockOccurrenceDetailPrintsApi({
    page,
    permissions: ['fleet.read', 'occurrences.resolve', 'trip.financials'],
  })
  await page.route(/\/trip-occurrences\/[^/?]+$/, async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Authorization, Content-Type',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 })
    const body = { data: { ...STOP_OCCURRENCE } as Record<string, unknown> }
    body.data.receivingCharge = {
      declaredAmount: '650.00',
      driverPix: { key: '11999998888', type: 'phone' },
      paidBy: 'driver',
      photos: [
        {
          expiresAt: '2099-01-01T00:00:00.000Z',
          label: 'Placa',
          slotKey: 'plate',
          url: photo('Foto da placa'),
        },
        {
          expiresAt: '2099-01-01T00:00:00.000Z',
          label: 'Extrato do pagamento',
          slotKey: 'payment_receipt',
          url: photo('Extrato'),
        },
      ],
    }
    return route.fulfill({
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  })
  await loginAsLocalUser(page)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/ocorrencias/${STOP_OCCURRENCE_ID}`)
}

for (const viewport of ['desktop', 'mobile'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`spec 317: cobrança no recebimento — ${viewport} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(VIEWPORTS[viewport])
      await open(page)
      await expect(page.getByText('Cobrança no recebimento').first()).toBeVisible()
      await expect(page.getByText('11999998888')).toBeVisible()
      if (process.env.PLAYWRIGHT_SAVE_PRINTS === 'true') {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.screenshot({
          fullPage: true,
          path: resolve(PRINTS_DIRECTORY, `cobranca-${viewport}-${theme}.png`),
        })
      }
    })
  }
}
