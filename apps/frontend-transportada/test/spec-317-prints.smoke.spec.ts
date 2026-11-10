/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 T11: os prints da revisão de design (`web.md` §15) — "Ressarcimentos" com a cobrança no recebimento
 * (fotos rotuladas, quem pagou e PIX) e a ficha do cliente com o selo "Possível cobrança na entrega", em tema claro
 * e escuro, no desktop (1440) e no celular (390). Fora do smoke da CI (o `testMatch` do `playwright.config.ts` é uma
 * lista explícita): rodar com `PLAYWRIGHT_TEST_MATCH=spec-317-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/** O service worker do preview recarrega a página no meio do teste e devolve o menu ao estado inicial. */
test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_317_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/317-cobranca-no-recebimento-vai-para-acertos/prints')

const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const
const THEMES = ['light', 'dark'] as const

const CLIENT_ID = '00000000-0000-4000-8000-000000000f01'
const STOP_OCCURRENCE_ID = '00000000-0000-4000-8000-000000000f02'
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

/** O CSP do painel só deixa `img-src 'self'` e o armazenamento: a foto do print sai do mesmo domínio, por rota simulada. */
function photoSvg(color: string, text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="${color}"/><text x="120" y="88" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${text}</text></svg>`
}

function photo(name: string): string {
  return `/mock-photo-${name}.svg`
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

const REPORT = {
  data: [
    {
      accessKey: null,
      amount: '120.50',
      chargeType: 'receiving_charge',
      chargedOn: '2026-11-10',
      contractorId: '00000000-0000-4000-8000-000000000e01',
      hasSettlement: false,
      id: '00000000-0000-4000-8000-000000000f10',
      noteNumber: '899853',
      noteSeries: '1',
      occurrenceId: null,
      photos: [
        {
          expiresAt: '2099-01-01T00:00:00Z',
          label: 'Placa de cobrança',
          slotKey: 'charge_sign',
          url: photo('placa'),
        },
        {
          expiresAt: '2099-01-01T00:00:00Z',
          label: 'Comprovante de pagamento',
          slotKey: 'payment_receipt',
          url: photo('comprovante'),
        },
      ],
      receivingCharge: {
        driverPayoutSentAt: null,
        driverPixKey: 'motorista@exemplo.com.br',
        driverPixKeyType: 'email',
        paidBy: 'driver',
      },
      status: 'recorded',
      stopOccurrenceId: STOP_OCCURRENCE_ID,
      tripDocumentId: '00000000-0000-4000-8000-000000000f11',
      tripId: '00000000-0000-4000-8000-000000000f12',
    },
    {
      accessKey: null,
      amount: '64.90',
      chargeType: 'returned_goods',
      chargedOn: '2026-11-09',
      contractorId: '00000000-0000-4000-8000-000000000e01',
      hasSettlement: true,
      id: '00000000-0000-4000-8000-000000000f13',
      noteNumber: '4521',
      noteSeries: '1',
      occurrenceId: '00000000-0000-4000-8000-000000000f14',
      photos: [],
      receivingCharge: null,
      status: 'approved',
      stopOccurrenceId: null,
      tripDocumentId: '00000000-0000-4000-8000-000000000f15',
      tripId: null,
    },
  ],
  page: { nextCursor: null },
  totals: {
    byChargeType: [
      { amount: '120.50', chargeType: 'receiving_charge', count: 1 },
      { amount: '64.90', chargeType: 'returned_goods', count: 1 },
    ],
    totalAmount: '185.40',
    totalCount: 2,
  },
}

/** No celular o menu lateral nasce aberto sobre a tela: fecha antes de fotografar. */
async function closeMenuWhenOpen(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.waitForTimeout(400)
}

async function navigateTo(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: Ressarcimentos com cobrança no recebimento (${theme}, ${viewport})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['fleet.read', 'trip.financials'],
      })
      await page.route(/\/occurrence-charges\/report(?:\?.*)?$/, (route) => fulfill(route, REPORT))
      await page.route(/\/contractors(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: [
            {
              closingPeriod: 'monthly',
              displayName: 'Mercado Bom Preço',
              id: '00000000-0000-4000-8000-000000000e01',
              taxId: '11222333000144',
            },
          ],
        }),
      )
      await page.route(/\/mock-photo-placa\.svg$/, (route) =>
        route.fulfill({ body: photoSvg('#7a4b1f', 'Placa'), contentType: 'image/svg+xml' }),
      )
      await page.route(/\/mock-photo-comprovante\.svg$/, (route) =>
        route.fulfill({ body: photoSvg('#1f5f7a', 'Comprovante'), contentType: 'image/svg+xml' }),
      )
      await loginAsLocalUser(page)
      await closeMenuWhenOpen(page)
      await navigateTo(page, '/ressarcimentos')
      await closeMenuWhenOpen(page)
      await expect(page.getByRole('heading', { level: 1, name: 'Ressarcimentos' })).toBeVisible()
      await expect(page.getByText('Pago pelo motorista')).toBeVisible()
      await expect(page.getByText('Placa de cobrança').first()).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `ressarcimentos-recebimento-${theme}-${viewport}.png`),
      })
    })

    test(`print: ficha do cliente com o selo (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(VIEWPORTS.desktop)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['fleet.read', 'fleet.manage'],
      })
      const client = {
        defaultServiceTimeMinutes: 30,
        deliveryFeeAmount: null,
        displayName: 'Supermercado Boa Compra',
        exceptions: [],
        id: CLIENT_ID,
        notes: '',
        requiresScheduling: false,
        status: 'active',
        taxId: '11222333000144',
        windows: [],
      }
      await page.route(/\/delivery-clients\/[^/?]+\/receiving-charge-flag$/, (route) =>
        fulfill(route, {
          data: { flaggedAt: '2026-11-10T14:30:00Z', sourceStopOccurrenceId: STOP_OCCURRENCE_ID },
        }),
      )
      await page.route(/\/delivery-clients(?:\?.*)?$/, (route) =>
        fulfill(route, { data: [client], page: { nextCursor: null } }),
      )
      await page.route(new RegExp(`/delivery-clients/${CLIENT_ID}$`, 'u'), (route) =>
        fulfill(route, { data: client }),
      )
      await page.route(/\/delivery-clients\/[^/]+\/(?:emails|whatsapp)(?:\?.*)?$/, (route) =>
        fulfill(route, { data: [] }),
      )
      await loginAsLocalUser(page)
      await closeMenuWhenOpen(page)
      await navigateTo(page, '/clientes')
      await closeMenuWhenOpen(page)
      /*
       * A ficha abre na largura de desktop e a janela encolhe depois: em 390 px o "Abrir" fica além da borda da
       * tabela e, no celular, o painel remonta logo depois de abrir e leva a seleção junto.
       */
      await page.setViewportSize(VIEWPORTS.desktop)
      await page.getByRole('button', { name: 'Abrir' }).first().click()
      await expect(page.getByText('Possível cobrança na entrega')).toBeVisible()
      await page.setViewportSize(size)
      await closeMenuWhenOpen(page)
      await expect(page.getByText('Possível cobrança na entrega')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `cliente-selo-${theme}-${viewport}.png`),
      })
    })
  }
}
