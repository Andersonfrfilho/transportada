/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T2.2/T2.2b: os prints da revisão de design (`web.md` §15) — a lista de Contas e o diálogo "Viagens do
 * pagamento", em tema claro e escuro, no desktop (1440) e no celular (390). Fora do smoke da CI (o `testMatch` do
 * `playwright.config.ts` é uma lista explícita): rodar com `PLAYWRIGHT_TEST_MATCH=spec-325-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

test.use({ serviceWorkers: 'block' })

const PRINTS_DIRECTORY =
  process.env.SPEC_325_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/325-contas-fixas-e-variaveis/prints')
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

function competence(): string {
  const now = new Date()
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function occurrence(input: {
  amount: string
  day: string
  id: string
  kind: 'fixed' | 'variable'
  name: string
  paid?: string
  payee?: { id: string; model: 'fixed' | 'route_table'; name: string }
  category: string
  status: 'canceled' | 'open' | 'paid'
}) {
  return {
    categoryId: `cat-${input.category}`,
    categoryName: input.category,
    competence: competence(),
    dueDate: `${competence()}-${input.day}`,
    expectedAmount: input.amount,
    expenseId: `exp-${input.id}`,
    expenseKind: input.kind,
    expenseName: input.name,
    id: input.id,
    paidAmount: input.paid ?? null,
    paidAt: input.paid === undefined ? null : `${competence()}-${input.day}`,
    paidBy: null,
    payeeDriverId: input.payee?.id ?? null,
    payeeDriverName: input.payee?.name ?? null,
    payeeDriverPaymentModel: input.payee?.model ?? null,
    settlementNote: null,
    slot: 1,
    status: input.status,
  }
}

const ITEMS = [
  occurrence({
    amount: '8500.00',
    category: 'Aluguel',
    day: '05',
    id: 'o1',
    kind: 'fixed',
    name: 'Aluguel do galpão',
    paid: '8500.00',
    status: 'paid',
  }),
  occurrence({
    amount: '3000.00',
    category: 'Pagamento de motorista/agregado',
    day: '15',
    id: 'o2',
    kind: 'fixed',
    name: 'Pagamento quinzenal',
    paid: '3000.00',
    payee: { id: 'd1', model: 'fixed', name: 'Carlos Lima' },
    status: 'paid',
  }),
  occurrence({
    amount: '3940.00',
    category: 'Seguro',
    day: '01',
    id: 'o3',
    kind: 'fixed',
    name: 'Seguro da frota',
    status: 'open',
  }),
  occurrence({
    amount: '4600.00',
    category: 'Pagamento de motorista/agregado',
    day: '28',
    id: 'o4',
    kind: 'variable',
    name: 'Acerto de fretes',
    payee: { id: 'd2', model: 'route_table', name: 'José Ramos' },
    status: 'open',
  }),
  occurrence({
    amount: '389.90',
    category: 'Outros',
    day: '28',
    id: 'o5',
    kind: 'fixed',
    name: 'Internet',
    status: 'open',
  }),
]

const CATEGORIES = [
  { active: true, id: 'cat-Aluguel', name: 'Aluguel', requiresDriver: false },
  { active: true, id: 'cat-Seguro', name: 'Seguro', requiresDriver: false },
  { active: true, id: 'cat-pay', name: 'Pagamento de motorista/agregado', requiresDriver: true },
]

const TRIPS = {
  items: [
    {
      amount: '400.00',
      completedOn: `${competence()}-03`,
      dailyAmount: '200.0000',
      days: 2,
      parcelKind: 'driver',
      route: { destination: 'CAMPINAS', origin: 'RIBEIRAO PRETO' },
      tripId: '1f2a3b4c-0000-4000-8000-000000000001',
    },
    {
      amount: '200.00',
      completedOn: `${competence()}-06`,
      dailyAmount: '200.0000',
      days: 1,
      parcelKind: 'driver',
      route: { destination: 'SAO CARLOS', origin: 'RIBEIRAO PRETO' },
      tripId: '1f2a3b4c-0000-4000-8000-000000000002',
    },
    {
      amount: '750.00',
      completedOn: `${competence()}-10`,
      dailyAmount: '250.0000',
      days: 3,
      parcelKind: 'driver',
      route: { destination: 'CAMPINAS', origin: null },
      tripId: '1f2a3b4c-0000-4000-8000-000000000003',
    },
  ],
  occurrence: ITEMS[1],
  tripsTotal: '1350.00',
}

async function openContas(page: Page): Promise<void> {
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Fechar menu' })
  if (await close.isVisible()) await close.dispatchEvent('click')
  await page.evaluate(() => {
    window.history.pushState({}, '', '/contas')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForTimeout(400)
  if (await close.isVisible()) await close.dispatchEvent('click')
}

for (const theme of THEMES) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`print: Contas (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: ['expenses.read', 'expenses.manage', 'fleet.read'],
      })
      await page.route(/\/expense-occurrences\/[^/]+\/trips(?:\?.*)?$/, (route) =>
        fulfill(route, { data: TRIPS }),
      )
      await page.route(/\/expense-occurrences\/[^/]+\/available-trips(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: {
            available: [],
            pending: [
              {
                completedOn: `${competence()}-11`,
                gap: 'NO_PLANNED_DURATION',
                parcelKind: 'driver',
                route: { destination: 'ARARAQUARA', origin: 'RIBEIRAO PRETO' },
                tripId: '1f2a3b4c-0000-4000-8000-000000000004',
              },
            ],
            period: { from: `${competence()}-01`, to: `${competence()}-15` },
          },
        }),
      )
      await page.route(/\/expense-occurrences(?:\?.*)?$/, (route) =>
        fulfill(route, {
          data: ITEMS,
          totals: {
            count: ITEMS.length,
            expectedAmount: '20429.90',
            paidAmount: '11500.00',
            paidByDriver: [{ driverId: 'd1', driverName: 'Carlos Lima', paidAmount: '3000.00' }],
          },
        }),
      )
      await page.route(/\/expense-categories(?:\?.*)?$/, (route) =>
        fulfill(route, { data: CATEGORIES }),
      )
      await loginAsLocalUser(page)
      await openContas(page)
      await expect(page.getByRole('heading', { level: 1, name: 'Contas' })).toBeVisible()
      await expect(page.getByText('Aluguel do galpão')).toBeVisible()
      await page.screenshot({
        fullPage: true,
        path: resolve(PRINTS_DIRECTORY, `contas-lista-${theme}-${viewport}.png`),
      })

      await page.getByRole('button', { name: 'Nova conta' }).click()
      await expect(page.getByRole('dialog', { name: 'Nova conta' })).toBeVisible()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `contas-nova-${theme}-${viewport}.png`),
      })
      await page.getByRole('button', { name: 'Cancelar' }).click()

      await page.getByRole('button', { name: 'Dar baixa' }).first().click()
      await expect(page.getByRole('dialog', { name: 'Dar baixa' })).toBeVisible()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `contas-baixa-${theme}-${viewport}.png`),
      })
      await page.getByRole('button', { name: 'Cancelar' }).click()

      await page.getByRole('button', { name: 'Viagens' }).nth(1).click()
      await expect(page.getByRole('dialog', { name: 'Viagens do pagamento' })).toBeVisible()
      await page.getByRole('button', { name: 'Adicionar viagens' }).click()
      await expect(page.getByText('fica de fora')).toBeVisible()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `contas-viagens-${theme}-${viewport}.png`),
      })
    })
  }
}
