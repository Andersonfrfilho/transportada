/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505: a fila de mensagens sem conversa no topo da lista de ocorrências — prints da
 * revisão de design e o smoke da atribuição. Fora do smoke da CI, como os outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockOccurrenceDetailPrintsApi } from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

const QUEUE = [
  {
    bodyText: 'Pode seguir com a descarga, a gente paga a taxa.',
    candidates: [
      {
        contractorName: 'Contratante Alfa Indústria',
        conversationId: '00000000-0000-4000-8000-000000183901',
        lastOutbound: {
          at: '2026-09-24T14:20:00.000Z',
          preview: 'O recebedor está cobrando taxa de descarga de R$ 180,00. Autorizam?',
        },
        occurrenceId: '00000000-0000-4000-8000-000000183001',
        occurrenceKind: 'document',
      },
      {
        contractorName: 'Contratante Alfa Indústria',
        conversationId: '00000000-0000-4000-8000-000000183902',
        lastOutbound: {
          at: '2026-09-24T11:05:00.000Z',
          preview: 'Chegou uma caixa avariada na NF 4498. Seguimos com a devolução?',
        },
        occurrenceId: '00000000-0000-4000-8000-000000183002',
        occurrenceKind: 'document',
      },
    ],
    channel: 'whatsapp',
    contact: { contactId: '00000000-0000-4000-8000-000000183030', name: 'Maria Souza' },
    id: '00000000-0000-4000-8000-000000183910',
    receivedAt: '2026-09-24T15:02:00.000Z',
    senderAddress: '5511987654321',
  },
]

async function open(page: Page, assigned: string[]): Promise<void> {
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
  await page.route(/\/occurrence-conversations\/unassigned\/[^/]+\/assign$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    const body = route.request().postDataJSON() as { conversationId: string }
    assigned.push(body.conversationId)
    queue = []
    return route.fulfill({
      body: JSON.stringify({ data: { conversationId: body.conversationId, messageId: 'm-1' } }),
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

function queueSection(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: '1 mensagem sem conversa' }),
  })
}

test('print: a fila no topo da lista', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await open(page, [])
  await expect(queueSection(page)).toBeVisible()
  await queueSection(page).screenshot({
    path: resolve(PRINTS_DIRECTORY, 'fila-sem-conversa-desktop.png'),
  })
})

test('print: a fila no celular', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await open(page, [])
  await expect(queueSection(page)).toBeVisible()
  await queueSection(page).screenshot({
    path: resolve(PRINTS_DIRECTORY, 'fila-sem-conversa-celular.png'),
  })
})

test('smoke: escolher a segunda conversa e atribuir tira a mensagem da fila', async ({ page }) => {
  const assigned: string[] = []
  await page.setViewportSize({ height: 900, width: 1440 })
  await open(page, assigned)
  const section = queueSection(page)
  await section.getByRole('radio').nth(1).check()
  await section.getByRole('button', { name: 'Atribuir' }).click()
  await expect(section).toBeHidden()
  expect(assigned).toEqual(['00000000-0000-4000-8000-000000183902'])
})
