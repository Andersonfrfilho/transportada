/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Descartar mensagens sem conversa: prints (claro/escuro, 1440 e 375) e o smoke do descarte em lote.
 * Fora do smoke da CI: `PLAYWRIGHT_TEST_MATCH`.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockOccurrenceDetailPrintsApi } from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.UNASSIGNED_PRINTS_DIRECTORY ??
  resolve(process.cwd(), 'test-results/unassigned-prints')
mkdirSync(PRINTS_DIRECTORY, { recursive: true })

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

const item = (index: number, bodyText: string, senderAddress: string) => ({
  bodyText,
  candidates: [],
  channel: 'whatsapp',
  contact: null,
  id: `00000000-0000-4000-8000-00000099${String(index).padStart(4, '0')}`,
  receivedAt: `2026-11-${String(19 - index).padStart(2, '0')}T19:07:00.000Z`,
  senderAddress,
})
const QUEUE = [
  item(1, '', '5527992924483'),
  item(2, '', '5511999910621'),
  item(3, 'Obrigado, boleto recebido', '5516997039738'),
]

async function open(page: Page, dismissed: string[][]): Promise<void> {
  await mockOccurrenceDetailPrintsApi({
    page,
    permissions: ['fleet.read', 'occurrences.resolve'],
  })
  let queue: unknown[] = [...QUEUE]
  await page.route(/\/occurrence-conversations\/unassigned$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    return route.fulfill({
      body: JSON.stringify({ data: queue }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
    })
  })
  await page.route(/\/occurrence-conversations\/unassigned\/dismiss$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    const body = route.request().postDataJSON() as { ids: string[] }
    dismissed.push(body.ids)
    queue = queue.filter((entry) => !body.ids.includes((entry as { id: string }).id))
    return route.fulfill({
      body: JSON.stringify({ data: { dismissed: body.ids.length } }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
    })
  })
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/ocorrencias')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

const section = (page: Page, count: number) =>
  page.locator('section', {
    has: page.getByRole('heading', { name: `${count} mensagens sem conversa` }),
  })

for (const viewport of [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 812, name: 'mobile', width: 375 },
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`print: fila com Descartar — ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.emulateMedia({ colorScheme: theme })
      await open(page, [])
      await expect(section(page, 3)).toBeVisible()
      await section(page, 3).screenshot({
        path: resolve(PRINTS_DIRECTORY, `fila-${viewport.name}-${theme}.png`),
      })
      await section(page, 3).getByRole('button', { name: 'Descartar todas' }).click()
      await expect(
        section(page, 3).getByRole('button', { name: 'Sim, descartar todas' }),
      ).toBeVisible()
      await section(page, 3).screenshot({
        path: resolve(PRINTS_DIRECTORY, `confirmar-${viewport.name}-${theme}.png`),
      })
    })
  }
}

test('smoke: descartar uma e depois todas esvazia a fila', async ({ page }) => {
  const dismissed: string[][] = []
  await page.setViewportSize({ height: 900, width: 1440 })
  await open(page, dismissed)
  const queueSection = section(page, 3)
  await queueSection.getByRole('button', { name: 'Descartar', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '2 mensagens sem conversa' })).toBeVisible()
  await page.getByRole('button', { name: 'Descartar todas' }).click()
  await page.getByRole('button', { name: 'Sim, descartar todas' }).click()
  await expect(page.getByRole('heading', { name: /mensagens? sem conversa/ })).toBeHidden()
  expect(dismissed.map((ids) => ids.length)).toEqual([1, 2])
})
