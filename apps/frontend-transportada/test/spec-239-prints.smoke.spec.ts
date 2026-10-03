/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, type Page, type Route, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 239 (`web.md` §15): a aba "Localização" das viagens com a API dublada — desligado, a
 * confirmação com o número, aguardando a carência e sem permissão. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-239-prints.smoke.spec.ts` e grava os PNGs em `specs/239-.../prints/`.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev`: o app redireciona para a URL
 * do `.env`, então preview em porta alternativa devolve a árvore de outra sessão.
 */
const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/239-o-expurgo-se-liga-na-tela/prints')
const VIEWPORTS = [
  { height: 900, label: '1280', theme: 'dark', width: 1280 },
  { height: 844, label: '375', theme: 'light', width: 375 },
] as const
type Viewport = (typeof VIEWPORTS)[number]

const DAY_MS = 86_400_000
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const MANAGER_PERMISSIONS = ['trip.read', 'trip.manage', 'settings.manage', 'fleet.read'] as const
const READER_PERMISSIONS = ['trip.read', 'fleet.read'] as const

type MockSettings = {
  origin: 'company' | 'default'
  purgeEffectiveAt: string | null
  purgeEnabled: boolean
  retentionDays: number
  updatedAt: string | null
}

const DEFAULT_SETTINGS: MockSettings = {
  origin: 'default',
  purgeEffectiveAt: null,
  purgeEnabled: false,
  retentionDays: 90,
  updatedAt: null,
}

const IMPACT = {
  byTable: [
    { capped: false, count: 1280, kind: 'stop_event' },
    { capped: false, count: 214, kind: 'delivery_proof' },
    { capped: false, count: 96, kind: 'status_event' },
    { capped: false, count: 31, kind: 'stop_occurrence' },
    { capped: false, count: 12, kind: 'document_occurrence' },
  ],
}

function printPath(name: string, viewport: Viewport): string {
  return resolve(PRINTS_DIRECTORY, `spec-239-${name}-${viewport.label}-${viewport.theme}.png`)
}

async function fulfill(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status: 200,
  })
}

/** Dublê da retenção: o `PUT` grava na variável, para o painel reler o que o servidor guardou. */
async function mockLocationRetentionApi(
  page: Page,
  initial: MockSettings,
): Promise<Readonly<{ requests: () => readonly string[] }>> {
  let settings = initial
  const requests: string[] = []
  await page.route(
    /\/company-settings\/location-retention(?:\/impact)?(?:\?.*)?$/u,
    async (route) => {
      const request = route.request()
      const { pathname, search } = new URL(request.url())
      requests.push(`${request.method()} ${pathname.split('/').slice(-1)[0] ?? ''}${search}`)
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ headers: CORS_HEADERS, status: 204 })
        return
      }
      if (pathname.endsWith('/impact')) {
        await fulfill(route, { data: IMPACT })
        return
      }
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as { purgeEnabled: boolean; retentionDays: number }
        settings = {
          ...settings,
          ...body,
          origin: 'company',
          purgeEffectiveAt: new Date(Date.now() + DAY_MS).toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
      if (request.method() === 'DELETE') {
        settings = DEFAULT_SETTINGS
        await route.fulfill({ headers: CORS_HEADERS, status: 204 })
        return
      }
      await fulfill(route, { data: settings })
    },
  )
  return { requests: () => requests }
}

async function openLocationTab(
  input: Readonly<{
    permissions: readonly string[]
    settings: MockSettings
    viewport: Viewport
  }>,
  page: Page,
) {
  await page.setViewportSize({ height: input.viewport.height, width: input.viewport.width })
  await page.emulateMedia({ colorScheme: input.viewport.theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: [...input.permissions],
  })
  const retention = await mockLocationRetentionApi(page, input.settings)
  await loginAsLocalUser(page)
  await page.getByRole('tab', { name: 'Localização' }).click()
  return retention
}

function panel(page: Page) {
  return page.locator('section[aria-labelledby="location-retention-title"]')
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { innerWidth, scrollWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(scrollWidth, 'a página não pode ser mais larga que a janela').toBeLessThanOrEqual(
    innerWidth,
  )
}

for (const viewport of VIEWPORTS) {
  test(`aba Localização — desligado e confirmação com o número — ${viewport.label} ${viewport.theme}`, async ({
    page,
  }) => {
    const retention = await openLocationTab(
      { permissions: MANAGER_PERMISSIONS, settings: DEFAULT_SETTINGS, viewport },
      page,
    )

    await expect(panel(page).getByText('Desligado: nenhuma posição é apagada.')).toBeVisible()
    await expect(panel(page).getByLabel('Prazo de retenção (dias)')).toHaveValue('90')
    expect(retention.requests().some((request) => request.includes('impact'))).toBe(false)
    await expectNoHorizontalOverflow(page)
    await panel(page).screenshot({ path: printPath('desligado', viewport) })

    await panel(page).getByRole('button', { name: 'Ligar o apagamento' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Ligar e apagar 1.633 pontos' })).toBeVisible()
    await expect(dialog.getByText('LGPD, art. 5º, I', { exact: false })).toBeVisible()
    expect(retention.requests().filter((request) => request.includes('impact'))).toEqual([
      'GET impact?retentionDays=90',
    ])
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: printPath('confirmacao', viewport) })

    await dialog.getByRole('button', { name: 'Ligar e apagar 1.633 pontos' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(panel(page).getByText(/aguardando a carência de 24 horas/u)).toBeVisible()
    await expect(panel(page).getByText(/Começa a valer em \d{2}\/\d{2} \d{2}:\d{2}/u)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await panel(page).screenshot({ path: printPath('aguardando-carencia', viewport) })
  })

  test(`aba Localização — sem permissão — ${viewport.label} ${viewport.theme}`, async ({
    page,
  }) => {
    const retention = await openLocationTab(
      { permissions: READER_PERMISSIONS, settings: DEFAULT_SETTINGS, viewport },
      page,
    )

    await expect(
      panel(page).getByText(
        'Somente quem administra as configurações da empresa vê e altera este prazo.',
      ),
    ).toBeVisible()
    await expect(panel(page).getByRole('button')).toHaveCount(0)
    expect(retention.requests()).toEqual([])
    await expectNoHorizontalOverflow(page)
    await panel(page).screenshot({ path: printPath('sem-permissao', viewport) })
  })
}
