/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T604: a conversa da ocorrência no app do motorista — o atalho com as novas, a lista, a
 * conversa que marca lida ao abrir e a resposta com a chave. Prints a 390 px (o app é do celular).
 * Fora do smoke da CI, como os outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000183001'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

type Calls = { method: string; path: string; key: null | string; body: unknown }[]

async function openDriverApp(page: Page, calls: Calls): Promise<void> {
  await page.setViewportSize({ height: 844, width: 390 })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page })
  let read = false
  const messages: unknown[] = [
    {
      authorName: 'Operadora Lima',
      bodyText:
        'O recebedor quer cobrar descarga. Aguarde na doca até eu confirmar com a contratante.',
      createdAt: '2026-09-24T14:22:00.000Z',
      direction: 'outbound',
      id: 'message-1',
      status: 'delivered',
    },
  ]
  const json = (body: unknown, status = 200) => ({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
  await page.route(/\/me\/trips\/current\/occurrence-conversations$/, async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    return route.fulfill(
      json({
        data: [
          {
            lastMessageAt: '2026-09-24T14:22:00.000Z',
            occurrenceId: OCCURRENCE_ID,
            occurrenceLabel: 'NF 4512/1',
            unreadCount: read ? 0 : 1,
          },
        ],
      }),
    )
  })
  await page.route(
    /\/me\/trips\/current\/occurrences\/[^/]+\/messages(\/read)?$/,
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS')
        return route.fulfill({ headers: CORS_HEADERS, status: 204 })
      const path = new URL(request.url()).pathname
      calls.push({
        body: request.method() === 'POST' ? request.postDataJSON() : null,
        key: request.headers()['idempotency-key'] ?? null,
        method: request.method(),
        path,
      })
      if (path.endsWith('/read')) {
        read = true
        return route.fulfill({ headers: CORS_HEADERS, status: 204 })
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { body: string }
        messages.push({
          authorName: null,
          bodyText: body.body,
          createdAt: '2026-09-24T14:30:00.000Z',
          direction: 'inbound',
          id: `message-${String(messages.length + 1)}`,
          status: null,
        })
        return route.fulfill(json({ data: { conversationId: 'c-1', messageId: 'm-2' } }, 201))
      }
      return route.fulfill(json({ data: messages }))
    },
  )
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
}

test('o atalho mostra a nova; abrir marca lida; responder leva a chave', async ({ page }) => {
  const calls: Calls = []
  await openDriverApp(page, calls)

  const shortcut = page.getByRole('button', { name: 'Mensagens da operação (1 nova)' })
  await expect(shortcut).toBeVisible()
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, 'motorista-app-atalho.png') })
  await shortcut.click()

  await expect(page.getByRole('heading', { name: 'Mensagens da operação' })).toBeVisible()
  await page.getByRole('button', { name: 'NF 4512/1 · 1 mensagem nova' }).click()
  await expect(page.getByText('Aguarde na doca até eu confirmar')).toBeVisible()
  await expect.poll(() => calls.some((call) => call.path.endsWith('/read'))).toBe(true)

  await page.getByRole('button', { name: 'Responder' }).click()
  await expect(page.getByText('Escreva a mensagem.')).toBeVisible()
  await page.getByLabel('Sua resposta').fill('  Certo, estou aguardando aqui.  ')
  await page.getByRole('button', { name: 'Responder' }).click()
  await expect(page.getByText('Certo, estou aguardando aqui.')).toBeVisible()
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, 'motorista-app-conversa.png') })

  const reply = calls.find((call) => call.method === 'POST' && !call.path.endsWith('/read'))
  expect(reply?.body).toEqual({ body: 'Certo, estou aguardando aqui.' })
  expect(reply?.key).toMatch(/^driver-message:/u)
})
