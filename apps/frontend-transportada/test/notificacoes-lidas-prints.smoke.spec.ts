/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints da revisão de design: o painel do sino só mostra lida do dia. Fora do smoke da CI:
 * rodar com `PLAYWRIGHT_TEST_MATCH=notificacoes-lidas-prints.smoke.spec.ts`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { NOTIFICATION_SMOKE_ROUTE_PATTERN } from './notification-smoke.helper'
import { mockOccurrenceDetailPrintsApi } from './spec-183-prints-smoke.helper'

test.use({
  serviceWorkers: 'block',
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
})

const PRINTS_DIRECTORY =
  process.env.NOTIFICATION_PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/notificacoes-lidas/prints')
const VIEWPORTS = [
  ['desktop', { height: 900, width: 1440 }],
  ['mobile', { height: 844, width: 375 }],
] as const
const THEMES = ['light', 'dark'] as const
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'DELETE, GET, PATCH, POST, OPTIONS',
  'access-control-allow-origin': '*',
}

function notification(input: { id: string; title: string; body: string; readAt?: Date }) {
  return {
    body: input.body,
    category: 'trip',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    id: input.id,
    payload: {},
    status: 'sent',
    templateKey: 'x',
    title: input.title,
    ...(input.readAt === undefined ? {} : { readAt: input.readAt.toISOString() }),
  }
}

const DAY = 86_400_000
const NOTIFICATIONS = [
  notification({ body: 'Canhoto aguardando conferência.', id: '1', title: 'Canhoto novo' }),
  notification({
    body: 'Lida há poucos minutos.',
    id: '2',
    readAt: new Date(Date.now() - 60_000),
    title: 'Viagem despachada (lida hoje)',
  }),
  notification({
    body: 'Lida dias atrás: não aparece.',
    id: '3',
    readAt: new Date(Date.now() - 2 * DAY),
    title: 'Ocorrência registrada (lida antes)',
  }),
  notification({
    body: 'Lida dias atrás: não aparece.',
    id: '4',
    readAt: new Date(Date.now() - 5 * DAY),
    title: 'Fatura emitida (lida antes)',
  }),
]

for (const theme of THEMES) {
  for (const [viewport, size] of VIEWPORTS) {
    test(`print: sino só com lidas do dia (${theme}, ${viewport})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(size)
      await mockOccurrenceDetailPrintsApi({ page, permissions: ['fleet.read'] })
      await loginAsLocalUser(page)
      await page.route(NOTIFICATION_SMOKE_ROUTE_PATTERN, async (route) => {
        const { pathname } = new URL(route.request().url())
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ headers: CORS, status: 204 })
        } else if (pathname.endsWith('/unread-count')) {
          await route.fulfill({
            body: JSON.stringify({ data: { unreadCount: 1 } }),
            contentType: 'application/json',
            headers: CORS,
          })
        } else if (pathname.endsWith('/stream')) {
          await route.fulfill({
            body: ': heartbeat\n\n',
            contentType: 'text/event-stream',
            headers: CORS,
          })
        } else {
          await route.fulfill({
            body: JSON.stringify({
              data: NOTIFICATIONS,
              meta: { unreadCount: 1 },
              pagination: { nextCursor: null },
            }),
            contentType: 'application/json',
            headers: CORS,
          })
        }
      })
      await page.getByRole('button', { name: 'Notificações', exact: true }).click()
      const panel = page.getByRole('region', { name: 'Notificações' })
      await expect(panel.getByText('Canhoto novo')).toBeVisible()
      await expect(panel.getByText('Viagem despachada (lida hoje)')).toBeVisible()
      await expect(panel.getByText('Ocorrência registrada (lida antes)')).toHaveCount(0)
      await expect(panel.getByText('Fatura emitida (lida antes)')).toHaveCount(0)
      await page.screenshot({ path: resolve(PRINTS_DIRECTORY, `sino-${theme}-${viewport}.png`) })
    })
  }
}
