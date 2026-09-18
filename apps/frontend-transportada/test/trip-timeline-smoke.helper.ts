/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
}

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000701'
const STOP_ID = '00000000-0000-4000-8000-000000000702'

function timelineItem(input: {
  readonly id: string
  readonly kind: string
  readonly occurredAt: string
}) {
  return {
    actorName: 'Marina Alves',
    channel: 'office',
    document: { id: DOCUMENT_ID, number: '456', series: '1' },
    fromStatus: input.kind === 'trip.status_changed' ? 'in_transit' : null,
    id: input.id,
    kind: input.kind,
    occurrence:
      input.kind === 'stop.occurrence' || input.kind === 'document.occurrence'
        ? { note: 'Caixa amassada', typeName: 'Avaria' }
        : null,
    occurredAt: input.occurredAt,
    onBehalfOfDriverName: 'João Pereira',
    recordedAt: null,
    returnReason: input.kind === 'document.returned' ? 'Cliente ausente' : null,
    stop: { id: STOP_ID, sequence: 1 },
    toStatus:
      input.kind === 'trip.status_changed'
        ? 'on_delivery_route'
        : input.kind === 'document.status_changed'
          ? 'separated'
          : null,
  }
}

/** Os oito `kind`s do D5, um por item — a primeira página, servida sem `cursor`. */
const FIRST_PAGE_ITEMS = [
  timelineItem({ id: 'evt-1', kind: 'trip.dispatched', occurredAt: '2026-09-18T08:00:00.000Z' }),
  timelineItem({
    id: 'evt-2',
    kind: 'trip.status_changed',
    occurredAt: '2026-09-18T08:05:00.000Z',
  }),
  timelineItem({ id: 'evt-3', kind: 'stop.arrived', occurredAt: '2026-09-18T08:10:00.000Z' }),
  timelineItem({
    id: 'evt-4',
    kind: 'document.delivered',
    occurredAt: '2026-09-18T08:15:00.000Z',
  }),
]

/** A segunda página, servida quando o cliente manda `cursor=page-2` — o "carregar mais". */
const SECOND_PAGE_ITEMS = [
  timelineItem({ id: 'evt-5', kind: 'document.returned', occurredAt: '2026-09-18T08:20:00.000Z' }),
  timelineItem({ id: 'evt-6', kind: 'stop.occurrence', occurredAt: '2026-09-18T08:25:00.000Z' }),
  timelineItem({
    id: 'evt-7',
    kind: 'document.occurrence',
    occurredAt: '2026-09-18T08:30:00.000Z',
  }),
  timelineItem({
    id: 'evt-8',
    kind: 'document.status_changed',
    occurredAt: '2026-09-18T08:35:00.000Z',
  }),
]

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 200,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 204,
  })
}

/**
 * Spec 158 T8: `GET /trips/:id/timeline` com os oito `kind`s do D5 em duas páginas, para exercitar
 * "carregar mais". Registrado **por cima** de `mockTripWorkspaceApi` — o mais recente vence no
 * Playwright (mesmo padrão de `mockFieldDeliverySmokeApi`).
 */
export async function mockTripTimelineApi(page: Page): Promise<void> {
  await page.route(/\/trips\/[^/]+\/timeline(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const url = new URL(route.request().url())
    const hasCursor = url.searchParams.get('cursor') !== null
    await fulfillJson(route, {
      data: hasCursor
        ? { items: SECOND_PAGE_ITEMS, nextCursor: null }
        : { items: FIRST_PAGE_ITEMS, nextCursor: 'page-2' },
    })
  })
}
