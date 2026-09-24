/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

import { mockTripWorkspaceApi } from './trip-smoke.helper'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export const DOCUMENT_OCCURRENCE_ID = '00000000-0000-4000-8000-000000183001'
export const STOP_OCCURRENCE_ID = '00000000-0000-4000-8000-000000183002'
const TRIP_ID = '00000000-0000-4000-8000-000000183010'

const DOCUMENT_OCCURRENCE = {
  actorName: 'Operador Sintético',
  case: {
    decision: null,
    redeliveryPolicy: 'allowed',
    settlementTotal: null,
    status: 'recorded',
    updatedAt: '2026-09-24T14:12:00.000Z',
  },
  channel: 'driver_app',
  createdAt: '2026-09-24T14:12:00.000Z',
  description: 'Recebedor está cobrando taxa de descarga para liberar a doca.',
  document: {
    contractor: {
      contractorId: '00000000-0000-4000-8000-000000183020',
      name: 'Contratante Alfa Indústria',
      taxId: '11222333000181',
    },
    destination: {
      city: 'Guarulhos',
      label: 'Avenida da Doca, 500 - Guarulhos/SP',
      origin: 'delivery',
      postalCode: '07000000',
      recipientName: 'Galpão de entrega Beta',
      state: 'SP',
    },
    nfeDocumentId: '00000000-0000-4000-8000-000000183030',
    totalValue: '48320.0000',
  },
  driver: {
    driverId: '00000000-0000-4000-8000-000000183040',
    email: 'motorista.sintetico@example.test',
    name: 'Motorista Sintético Alves',
    phone: '11999990001',
    picturePath: null,
    whatsappPhone: '5511999990001',
  },
  driverName: 'Motorista Sintético Alves',
  hasAttachment: false,
  id: DOCUMENT_OCCURRENCE_ID,
  invoiceNumber: '4512',
  invoiceSeries: '1',
  notifies: false,
  onBehalfOfDriverName: null,
  source: 'document',
  stage: 'delivery',
  stopLabel: 'Parada 2 · Guarulhos',
  tripId: TRIP_ID,
  typeName: 'Cobrança inesperada no local',
  vehiclePlate: 'ABC1D23',
} as const

const STOP_OCCURRENCE = {
  ...DOCUMENT_OCCURRENCE,
  actorName: 'Escritório Sintético',
  case: null,
  channel: 'office',
  createdAt: '2026-09-24T13:47:00.000Z',
  description: 'Doca fechada no horário combinado.',
  document: null,
  driver: null,
  driverName: '',
  id: STOP_OCCURRENCE_ID,
  invoiceNumber: null,
  invoiceSeries: null,
  onBehalfOfDriverName: 'Motorista Sintético Alves',
  source: 'stop',
  stage: null,
  typeName: 'dock_closed',
} as const

const FEED_ITEMS = [DOCUMENT_OCCURRENCE, STOP_OCCURRENCE] as const

/** Spec 183 T206: a história da ocorrência de nota — registro, fotos, aviso, resposta e decisão. */
const DOCUMENT_TIMELINE = {
  events: [
    {
      actor: { kind: 'driver', name: 'Motorista Sintético Alves' },
      id: 'occurrence.recorded:1',
      isKey: true,
      kind: 'occurrence.recorded',
      occurredAt: '2026-09-24T14:12:00.000Z',
      sincePreviousSeconds: null,
    },
    {
      actor: { kind: 'driver', name: 'Motorista Sintético Alves' },
      id: 'occurrence.photo:1',
      isKey: false,
      kind: 'occurrence.photo',
      occurredAt: '2026-09-24T14:12:00.000Z',
      photoCount: 2,
      sincePreviousSeconds: 0,
    },
    {
      actor: { kind: 'system', name: null },
      deliveryStatus: 'sent',
      id: 'contractor.mail.sent:1',
      interpretation: null,
      isKey: false,
      kind: 'contractor.mail.sent',
      occurredAt: '2026-09-24T14:13:00.000Z',
      sincePreviousSeconds: 60,
    },
    {
      actor: { kind: 'operation', name: 'Operador Sintético' },
      fromStatus: 'under_review',
      id: 'case.transition:2',
      isKey: false,
      kind: 'case.transition',
      note: '',
      occurredAt: '2026-09-24T14:30:00.000Z',
      sincePreviousSeconds: 1020,
      toStatus: 'awaiting_contractor',
    },
    {
      actor: { kind: 'contractor', name: null },
      deliveryStatus: null,
      id: 'contractor.mail.received:2',
      interpretation: 'message',
      isKey: false,
      kind: 'contractor.mail.received',
      occurredAt: '2026-09-24T15:05:00.000Z',
      sincePreviousSeconds: 2100,
    },
    {
      actor: { kind: 'contractor', name: 'Compradora Sintética' },
      fromStatus: 'awaiting_contractor',
      id: 'case.transition:3',
      isKey: true,
      kind: 'case.transition',
      note: 'Pode descarregar, a taxa é nossa.',
      occurredAt: '2026-09-24T15:20:00.000Z',
      sincePreviousSeconds: 900,
      toStatus: 'decided',
    },
  ],
  timings: {
    contractorAskedAt: '2026-09-24T14:13:00.000Z',
    contractorRepliedAt: '2026-09-24T15:05:00.000Z',
    driverReleasedAt: '2026-09-24T15:20:00.000Z',
    openSince: '2026-09-24T14:12:00.000Z',
    openUntil: null,
  },
} as const

const STOP_TIMELINE = {
  events: [
    {
      actor: { kind: 'operation', name: 'Escritório Sintético' },
      id: 'occurrence.recorded:2',
      isKey: true,
      kind: 'occurrence.recorded',
      occurredAt: '2026-09-24T13:47:00.000Z',
      sincePreviousSeconds: null,
    },
  ],
  timings: {
    contractorAskedAt: null,
    contractorRepliedAt: null,
    driverReleasedAt: null,
    openSince: '2026-09-24T13:47:00.000Z',
    openUntil: null,
  },
} as const

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({ headers: CORS_HEADERS, status: 204 })
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status: 200,
  })
}

/**
 * Spec 183 T204: a lista e o detalhe da ocorrência para os prints da revisão de design. Estende
 * `mockTripWorkspaceApi` (sessão, permissões, marca da instalação) e registra por último as rotas
 * de ocorrência, que vencem as dele.
 */
export async function mockOccurrenceDetailPrintsApi(
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page: input.page,
    permissions: input.permissions,
  })

  await input.page.route(/\/trip-occurrences(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    return fulfillJson(route, { data: FEED_ITEMS, pagination: { nextCursor: null } })
  })

  await input.page.route(/\/trip-occurrences\/[^/?]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const id = new URL(route.request().url()).pathname.split('/').pop()
    const item = FEED_ITEMS.find((candidate) => candidate.id === id)
    if (item === undefined) {
      return route.fulfill({
        body: JSON.stringify({ error: { code: 'TRIP_OCCURRENCE_NOT_FOUND' } }),
        contentType: 'application/json',
        headers: CORS_HEADERS,
        status: 404,
      })
    }
    return fulfillJson(route, { data: item })
  })

  await input.page.route(/\/trip-occurrences\/[^/]+\/timeline$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    return fulfillJson(route, {
      data: id === DOCUMENT_OCCURRENCE_ID ? DOCUMENT_TIMELINE : STOP_TIMELINE,
    })
  })

  await input.page.route(/\/trip-occurrences\/[^/]+\/attachments$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    return fulfillJson(route, { data: [] })
  })
}
