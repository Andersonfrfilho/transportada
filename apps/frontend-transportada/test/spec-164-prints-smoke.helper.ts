/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const VEHICLE_ID = '00000000-0000-4000-8000-000000000b02'
const DRIVER_ID = '00000000-0000-4000-8000-000000000b03'
const STOP_ID = '00000000-0000-4000-8000-000000000b10'

export const OCCURRENCE_AWAITING_CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c01'
export const OCCURRENCE_DECIDED_ID = '00000000-0000-4000-8000-000000000c02'
export const OCCURRENCE_RETURNED_TO_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000c03'
export const OCCURRENCE_CANCELLED_ID = '00000000-0000-4000-8000-000000000c04'

const OCCURRENCE_DOCUMENT_IDS = {
  [OCCURRENCE_AWAITING_CONTRACTOR_ID]: '00000000-0000-4000-8000-000000000d01',
  [OCCURRENCE_DECIDED_ID]: '00000000-0000-4000-8000-000000000d02',
  [OCCURRENCE_RETURNED_TO_WAREHOUSE_ID]: '00000000-0000-4000-8000-000000000d03',
  [OCCURRENCE_CANCELLED_ID]: '00000000-0000-4000-8000-000000000d04',
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

function tripDocument(input: Readonly<{ id: string; openOccurrenceCase: boolean }>) {
  return {
    contact: { contractorName: 'Mercado Bom Preço', name: 'Recebedor', phone: null, taxId: '' },
    createdAt: '2026-09-15T08:00:00.000Z',
    cteAuthorized: true,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: input.id,
    loadedAt: '2026-09-15T08:30:00.000Z',
    nfeDocumentId: `${input.id}-nfe`,
    nfeNumber: '4521',
    nfeSeries: '1',
    openOccurrenceCase: input.openOccurrenceCase,
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: '2026-09-15T08:10:00.000Z',
    separationStatus: 'separated',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    updatedAt: '2026-09-15T08:30:00.000Z',
  } as const
}

const DOCUMENTS = [
  tripDocument({
    id: OCCURRENCE_DOCUMENT_IDS[OCCURRENCE_AWAITING_CONTRACTOR_ID],
    openOccurrenceCase: true,
  }),
]

/** Uma parada só, com marcador de tratativa aberta (RF36) e coordenada para o pino do mapa. */
const STOP = {
  addressKey: 'sao-paulo-01310-100',
  arrivedAt: null,
  cityCode: '3550308',
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: DOCUMENTS,
  hasOpenOccurrence: true,
  id: STOP_ID,
  label: 'São Paulo/SP',
  latitude: '-23.561684',
  longitude: '-46.655981',
  sequence: 1,
  state: 'SP',
} as const

const TRIP_DETAIL = {
  amounts: null,
  cargoLayout: null,
  cargoWeight: null,
  closeReason: null,
  closedAt: null,
  closedByName: null,
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-09-15T07:00:00.000Z',
  documents: DOCUMENTS,
  driverNames: ['Motorista Sintético'],
  drivers: [
    {
      driverId: DRIVER_ID,
      driverName: 'Motorista Sintético',
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
  updatedAt: '2026-09-15T09:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const

function caseView(
  input: Readonly<{
    decision: null | Readonly<{ kind: string; note: string }>
    redeliveryPolicy: 'allowed' | 'blocked'
    status: string
  }>,
) {
  return {
    decision:
      input.decision === null
        ? null
        : {
            decidedAt: '2026-09-18T10:00:00.000Z',
            kind: input.decision.kind,
            note: input.decision.note,
          },
    redeliveryPolicy: input.redeliveryPolicy,
    settlementTotal: null,
    status: input.status,
    updatedAt: '2026-09-18T10:00:00.000Z',
  } as const
}

function occurrenceFeedItem(
  input: Readonly<{
    caseView: ReturnType<typeof caseView>
    id: string
    typeName: string
  }>,
) {
  return {
    case: input.caseView,
    createdAt: '2026-09-18T09:00:00.000Z',
    description: 'Caixa amassada na conferência do galpão.',
    driverName: 'Motorista Sintético',
    hasAttachment: false,
    id: input.id,
    invoiceNumber: '4521',
    invoiceSeries: '1',
    notifies: true,
    source: 'document',
    stage: 'separation',
    stopLabel: 'São Paulo/SP',
    tripId: TRIP_ID,
    typeName: input.typeName,
    vehiclePlate: 'ABC1D23',
  } as const
}

const OCCURRENCE_FEED_ITEMS = [
  occurrenceFeedItem({
    caseView: caseView({
      decision: null,
      redeliveryPolicy: 'allowed',
      status: 'awaiting_contractor',
    }),
    id: OCCURRENCE_AWAITING_CONTRACTOR_ID,
    typeName: 'Avaria parcial',
  }),
  occurrenceFeedItem({
    caseView: caseView({
      decision: { kind: 'goods_paid', note: 'Cliente pagou os produtos no balcão.' },
      redeliveryPolicy: 'blocked',
      status: 'decided',
    }),
    id: OCCURRENCE_DECIDED_ID,
    typeName: 'Avaria total',
  }),
  occurrenceFeedItem({
    caseView: caseView({
      decision: null,
      redeliveryPolicy: 'allowed',
      status: 'returned_to_warehouse',
    }),
    id: OCCURRENCE_RETURNED_TO_WAREHOUSE_ID,
    typeName: 'Caixa trocada',
  }),
  occurrenceFeedItem({
    caseView: caseView({ decision: null, redeliveryPolicy: 'allowed', status: 'cancelled' }),
    id: OCCURRENCE_CANCELLED_ID,
    typeName: 'Registro por engano',
  }),
]

const SETTLEMENT_VIEW = {
  items: [
    {
      amount: '89.90',
      amountSource: 'manual',
      payerId: DRIVER_ID,
      payerKind: 'driver',
      productCode: 'AZ-30',
      reimbursedAt: null,
    },
    {
      amount: '35.00',
      amountSource: 'manual',
      payerKind: 'carrier',
      productCode: 'AZ-31',
      reimbursedAt: null,
    },
  ],
  total: '124.90',
} as const

/**
 * Spec 164 T28: estende `mockTripWorkspaceApi` com a viagem, a parada com marcador de tratativa
 * aberta (RF36, para o print da listagem + mapa) e os endpoints do feed de ocorrências
 * (`GET /trip-occurrences`, `GET .../case/settlement`) — sobrescrevendo as rotas de
 * `mockTripWorkspaceApi` registradas por último, mesmo padrão do `field-delivery-smoke.helper.ts`.
 */
export async function mockOccurrencePrintsApi(
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page: input.page,
    permissions: input.permissions,
  })

  await input.page.route(/\/trips\/[^/]+\/allowed-actions$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: { documents: {}, stops: {}, trip: [] } })
  })

  await input.page.route(/\/trips\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: TRIP_DETAIL })
  })

  await input.page.route(/\/trip-occurrences(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: OCCURRENCE_FEED_ITEMS, pagination: { nextCursor: null } })
  })

  await input.page.route(/\/trip-occurrences\/[^/]+\/case\/settlement$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: SETTLEMENT_VIEW })
  })
}

const REIMBURSEMENT_ROWS = [
  {
    accessKey: null,
    amount: '89.90',
    chargeType: 'returned_goods',
    chargedOn: '2026-09-18',
    contractorId: '00000000-0000-4000-8000-000000000e01',
    hasSettlement: true,
    id: '00000000-0000-4000-8000-000000000f01',
    noteNumber: '4521',
    noteSeries: '1',
    occurrenceId: OCCURRENCE_DECIDED_ID,
    status: 'recorded',
    tripDocumentId: OCCURRENCE_DOCUMENT_IDS[OCCURRENCE_DECIDED_ID],
  },
  {
    accessKey: null,
    amount: '35.00',
    chargeType: 'returned_goods',
    chargedOn: '2026-09-17',
    contractorId: '00000000-0000-4000-8000-000000000e01',
    hasSettlement: false,
    id: '00000000-0000-4000-8000-000000000f02',
    noteNumber: '4519',
    noteSeries: '1',
    occurrenceId: OCCURRENCE_AWAITING_CONTRACTOR_ID,
    status: 'recorded',
    tripDocumentId: OCCURRENCE_DOCUMENT_IDS[OCCURRENCE_AWAITING_CONTRACTOR_ID],
  },
] as const

/**
 * `toOccurrenceChargeReportPage` (`extraChargesResponse.validation.ts`) lê `data` (as linhas) e
 * `page.nextCursor`/`totals` **soltos no envelope**, não aninhados dentro de `data` — formato
 * diferente do resto deste helper (`GET /trip-occurrences`, que aninha em `data`).
 */
const REIMBURSEMENT_REPORT_ENVELOPE = {
  data: REIMBURSEMENT_ROWS,
  page: { nextCursor: null },
  totals: {
    byChargeType: [{ amount: '124.90', chargeType: 'returned_goods', count: 2 }],
    totalAmount: '124.90',
    totalCount: 2,
  },
} as const

const CONTRACTORS = [
  {
    closingPeriod: 'monthly',
    displayName: 'Mercado Bom Preço',
    id: '00000000-0000-4000-8000-000000000e01',
    taxId: '11222333000144',
  },
] as const

/**
 * Spec 164 T28: mocks da página "Ressarcimentos" (`GET /occurrence-charges/report`,
 * `GET /contractors`) — a permissão exigida é `trip.financials`, à parte de `occurrences.resolve`
 * (spec 061 D4: quem valida ocorrência não vê valor).
 */
export async function mockReimbursementsApi(
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page: input.page,
    permissions: input.permissions,
  })

  await input.page.route(/\/occurrence-charges\/report(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, REIMBURSEMENT_REPORT_ENVELOPE)
  })

  await input.page.route(/\/contractors(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: CONTRACTORS })
  })
}
