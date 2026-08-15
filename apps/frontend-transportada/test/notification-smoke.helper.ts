/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'DELETE, GET, PATCH, POST, OPTIONS',
  'access-control-allow-origin': '*',
}

/**
 * Um padrão só para todos os caminhos do sino: a rota mais específica e a genérica se sobrepõem, e
 * no Playwright a última registrada vence — separar em vários padrões faria a ordem de registro
 * decidir qual corpo a página recebe.
 */
export const NOTIFICATION_SMOKE_ROUTE_PATTERN = /\/v1\/notifications(?:\/[^?]*)?(?:\?.*)?$/

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status: 200,
  })
}

/**
 * O sino do módulo de notificação fica no cabeçalho de toda página autenticada e conversa com a API
 * por conta própria, sem passar por nenhum hook nosso. No smoke o frontend é servido em 53100, fora
 * da allowlist de CORS da API — a chamada volta `net::ERR_FAILED` e reprova `expect(api.failures())`
 * em todos os cenários, mesmo naqueles que não têm nada a ver com notificação.
 */
export async function registerNotificationMocks(page: Page): Promise<void> {
  await page.route(NOTIFICATION_SMOKE_ROUTE_PATTERN, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }

    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/notifications/unread-count')) {
      await fulfillJson(route, { data: { unreadCount: 0 } })
      return
    }
    if (pathname.endsWith('/notifications/stream')) {
      await route.fulfill({
        body: ': heartbeat\n\n',
        contentType: 'text/event-stream',
        headers: CORS_HEADERS,
        status: 200,
      })
      return
    }
    if (pathname.endsWith('/notifications')) {
      await fulfillJson(route, {
        data: [],
        meta: { unreadCount: 0 },
        pagination: { nextCursor: null },
      })
      return
    }

    await route.fulfill({ headers: CORS_HEADERS, status: 204 })
  })
}
