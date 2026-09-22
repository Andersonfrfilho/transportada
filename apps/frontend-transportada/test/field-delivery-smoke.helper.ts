/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
}

const DRIVER_ID = '00000000-0000-4000-8000-000000000801'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000802'
const STOP_ID = '00000000-0000-4000-8000-000000000810'

export const FIELD_DELIVERY_DOCUMENT_IDS = [
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000904',
  '00000000-0000-4000-8000-000000000905',
] as const

/** A nota que "pula 1" deixa de fora — a primeira do lote, sem motivo especial. */
export const [SKIPPED_DOCUMENT_ID, ...DELIVERED_DOCUMENT_IDS] = FIELD_DELIVERY_DOCUMENT_IDS

/** A que falha de rede na primeira tentativa (aceite 7) — a segunda do lote a ser fotografada. */
export const NETWORK_FAILURE_DOCUMENT_ID = DELIVERED_DOCUMENT_IDS[0]

function tripDocument(input: Readonly<{ id: string; nfeNumber: string }>) {
  return {
    createdAt: '2026-09-18T08:00:00.000Z',
    cteAuthorized: true,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: input.id,
    loadedAt: '2026-09-18T08:30:00.000Z',
    nfeDocumentId: `${input.id}-nfe`,
    nfeNumber: input.nfeNumber,
    nfeSeries: '1',
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: '2026-09-18T08:10:00.000Z',
    separationStatus: 'separated',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    updatedAt: '2026-09-18T08:30:00.000Z',
  } as const
}

const DOCUMENTS = FIELD_DELIVERY_DOCUMENT_IDS.map((id, index) =>
  tripDocument({ id, nfeNumber: String(9000 + index) }),
)

const STOP = {
  addressKey: 'campinas-13010-100',
  arrivedAt: '2026-09-18T09:00:00.000Z',
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: DOCUMENTS,
  id: STOP_ID,
  label: 'Campinas/SP',
  sequence: 1,
} as const

const TRIP_DETAIL = {
  amounts: null,
  cargoLayout: null,
  cargoWeight: null,
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-09-18T07:00:00.000Z',
  documents: DOCUMENTS,
  driverNames: ['Motorista Sintetico'],
  drivers: [
    {
      driverId: DRIVER_ID,
      driverName: 'Motorista Sintetico',
      driverTaxId: '12345678901',
      position: 1,
    },
  ],
  estimatedArrivalFrozenAt: null,
  estimatedFinishAt: null,
  id: TRIP_ID,
  occupancy: null,
  requiresMdfe: null,
  requiresMdfeReason: null,
  status: 'on_delivery_route',
  stops: [STOP],
  updatedAt: '2026-09-18T09:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 204,
  })
}

/** Extrai um campo de texto de um corpo `multipart/form-data` — sem lib, só o que este smoke lê. */
export function readMultipartField(
  input: Readonly<{ boundary: string; fieldName: string; rawBody: string }>,
): string | undefined {
  const parts = input.rawBody.split(`--${input.boundary}`)
  const part = parts.find((candidate) => candidate.includes(`name="${input.fieldName}"`))
  if (part === undefined) return undefined
  const [, value] = part.split('\r\n\r\n')
  return value?.replace(/\r\n--?$/u, '').trim()
}

export type FieldDeliveryCallRecord = Readonly<{
  deliveredAt: string | undefined
  documentId: string
  idempotencyKey: string | undefined
}>

/**
 * Spec 156 T12 (aceites 5, 7): estende `mockTripWorkspaceApi` com uma viagem `on_delivery_route`,
 * 5 notas numa parada só, `allowed-actions` liberando `fieldDelivery` para as cinco, e o mock de
 * `POST .../field-delivery` — a primeira chamada de `NETWORK_FAILURE_DOCUMENT_ID` aborta (falha de
 * rede), as demais e o retry respondem 201. Sobrescreve as rotas de `mockTripWorkspaceApi`
 * registradas por último vence no Playwright (mesmo padrão do `t7-design`/T8 allowed-actions).
 */
export async function mockFieldDeliverySmokeApi(
  page: Page,
): Promise<Readonly<{ calls: () => readonly FieldDeliveryCallRecord[] }>> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['trip.read', 'trip.manage', 'trip.report-on-behalf'],
  })

  await page.route(/\/trips\/[^/]+\/allowed-actions$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: {
        documents: Object.fromEntries(
          FIELD_DELIVERY_DOCUMENT_IDS.map((id) => [id, ['fieldDelivery']]),
        ),
        stops: {},
        trip: ['startRoute'],
      },
    })
  })

  await page.route(/\/trips\/occurrence-types\/field$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })

  await page.route(/\/trips\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: TRIP_DETAIL })
  })

  const calls: FieldDeliveryCallRecord[] = []
  const failedOnce = new Set<string>()

  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/field-delivery$/, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const documentId = request.url().match(/documents\/([^/]+)\/field-delivery$/u)?.[1] ?? ''
    const contentType = (await request.headerValue('content-type')) ?? ''
    const boundary = contentType.split('boundary=')[1]
    const rawBody = request.postData() ?? ''
    const deliveredAt =
      boundary === undefined
        ? undefined
        : readMultipartField({ boundary, fieldName: 'deliveredAt', rawBody })
    const idempotencyKey = (await request.headerValue('idempotency-key')) ?? undefined
    calls.push({ deliveredAt, documentId, idempotencyKey })

    if (documentId === NETWORK_FAILURE_DOCUMENT_ID && !failedOnce.has(documentId)) {
      failedOnce.add(documentId)
      await route.abort('failed')
      return
    }

    await fulfillJson(
      route,
      {
        data: {
          alreadySettled: false,
          id: `${documentId}-event`,
          proofId: `${documentId}-proof`,
          stopCompleted: false,
          tripCompleted: false,
        },
      },
      201,
    )
  })

  return { calls: () => calls }
}
