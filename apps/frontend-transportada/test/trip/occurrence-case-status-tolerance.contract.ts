/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

const API_URL = 'https://api.example.test'
const LIST_INPUT = {
  cursor: null,
  filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
  order: 'desc',
  perPage: 20,
} as const
const PANEL = new URL(
  '../../src/modules/trip/components/OccurrenceCasePanel.component.tsx',
  import.meta.url,
)

function buildFeedItem(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    case: null,
    createdAt: '2026-09-22T19:03:10.795Z',
    description: 'Avaria no transporte',
    driverName: 'Motorista',
    hasAttachment: false,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    notifies: true,
    source: 'document',
    stage: 'separation',
    stopLabel: null,
    tripId: 'trip-1',
    typeName: 'Item avariado',
    vehiclePlate: 'ABC1D23',
    ...extra,
  }
}

const CASE_VIEW = {
  decision: null,
  redeliveryPolicy: 'allowed',
  settlementTotal: null,
  status: 'recorded',
  updatedAt: '2026-09-22T19:10:00.000Z',
} as const

function listWith(rawItem: unknown) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () =>
      Promise.resolve(Response.json({ data: [rawItem], pagination: { nextCursor: null } })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  }).listOccurrences(LIST_INPUT)
}

/**
 * Spec 266 T1.1: a API ganha estados de tratativa novos sem aviso. Um estado desconhecido degrada
 * para `unknown` e a página inteira continua — nunca reprova o feed. Tipo ou forma inválida (não
 * string) continua reprovando.
 */
describe('spec 266 T1.1: estado de tratativa desconhecido no feed', () => {
  test('aceita estado futuro, normaliza para unknown e ignora campos extras', async () => {
    const page = await listWith(
      buildFeedItem({
        case: {
          ...CASE_VIEW,
          resolution: { kind: 'future', at: '2026-10-15T10:00:00.000Z' },
          status: 'some_future_status',
        },
        resolution: { kind: 'future' },
      }),
    )

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.case?.status).toBe(TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS)
  })

  test('mantém o estado conhecido como veio', async () => {
    const page = await listWith(buildFeedItem({ case: { ...CASE_VIEW, status: 'under_review' } }))

    expect(page.items[0]?.case?.status).toBe('under_review')
  })

  test('status que não é texto continua reprovando a resposta', async () => {
    let failure: unknown = null
    try {
      await listWith(buildFeedItem({ case: { ...CASE_VIEW, status: 42 } }))
    } catch (caught) {
      failure = caught
    }
    expect(failure).toBeInstanceOf(Error)
  })

  test('o painel da tratativa mostra "—" para o estado desconhecido', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS')
    expect(panel).toContain("'—'")
  })
})
