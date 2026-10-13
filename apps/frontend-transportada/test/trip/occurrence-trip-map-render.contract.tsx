/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceTripMap } from '@/modules/trip/components/OccurrenceTripMap.component'
import { TRIP_TIMELINE_QUERY_KEY } from '@/modules/trip/hooks/useTripTimeline.hook'
import { TRIP_QUERY_KEY } from '@/modules/trip/shared/trip.constant'
import type { TripDetail, TripTimelineItem } from '@/modules/trip/shared/trip.types'

import {
  buildOccurrenceDetailFixture,
  DETAIL_FIXTURE_IDS,
} from '../fixtures/tripOccurrenceDetail.fixture'

const COMPANY_ID = 'company-1'
const FULL_ACCESS = ['fleet.read', 'trip.event-location'] as const
const READ_ONLY = ['fleet.read'] as const

const BASE: TripTimelineItem = {
  actorName: null,
  channel: null,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'arrived-1',
  kind: 'stop.arrived',
  location: {
    accuracyMeters: 5,
    capturedAt: '2026-10-10T09:00:00.000Z',
    distanceMeters: 35,
    latitude: -21.123456,
    longitude: -47.654321,
  },
  locationState: 'captured',
  occurrence: null,
  occurredAt: '2026-10-10T09:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 1 },
  toStatus: null,
}

const ITEMS: readonly TripTimelineItem[] = [
  BASE,
  {
    ...BASE,
    id: DETAIL_FIXTURE_IDS.occurrenceId,
    kind: 'document.occurrence',
    location: { ...BASE.location!, distanceMeters: 2300, latitude: -21.2, longitude: -47.6 },
    occurredAt: '2026-10-10T10:00:00.000Z',
  },
  {
    ...BASE,
    id: 'departed-1',
    kind: 'stop.departed',
    location: null,
    locationState: 'unavailable',
    occurredAt: '2026-10-10T11:00:00.000Z',
  },
]

const TRIP = {
  stops: [
    {
      addressKey: 'k1',
      arrivedAt: null,
      completedAt: null,
      deliveryWindowEnd: null,
      deliveryWindowStart: null,
      documents: [],
      id: 'stop-1',
      label: 'Armazém Central',
      latitude: '-21.1',
      longitude: '-47.5',
      sequence: 1,
    },
  ],
} as unknown as TripDetail

function render(
  input: Readonly<{
    items?: readonly TripTimelineItem[]
    permissions: readonly string[]
    seeded: boolean
  }>,
): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const occurrence = buildOccurrenceDetailFixture({ stopLabel: 'Armazém Central' })
  if (input.seeded) {
    client.setQueryData([TRIP_QUERY_KEY, COMPANY_ID, occurrence.tripId], TRIP)
    client.setQueryData([TRIP_QUERY_KEY, occurrence.tripId, TRIP_TIMELINE_QUERY_KEY], {
      pageParams: [null],
      pages: [{ items: input.items ?? ITEMS, nextCursor: null }],
    })
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <OccurrenceTripMap
        companyId={COMPANY_ID}
        occurrence={occurrence}
        permissions={input.permissions}
      />
    </QueryClientProvider>,
  )
}

describe('o painel "Mapa da viagem" da ocorrência (render)', () => {
  test('carregando: esqueleto com nome acessível, sem legenda', () => {
    const html = render({ permissions: FULL_ACCESS, seeded: false })

    expect(html).toContain('Mapa da viagem')
    expect(html).toContain('Carregando o mapa da viagem')
    expect(html).not.toContain('Centralizar no mapa')
  })

  test('com permissão: legenda com ícone + palavra, ocorrência em destaque e sem-posição com motivo', () => {
    const html = render({ permissions: FULL_ACCESS, seeded: true })

    expect(html).toContain('Chegada')
    expect(html).toContain('Esta ocorrência')
    expect(html).toContain('a 35 m da parada')
    expect(html).toContain('a 2,3 km da parada')
    expect(html).toContain('Sem posição: o aparelho não a entregou.')
    expect(html).toContain('Parada da nota: 1 · Armazém Central')
    expect(html).toContain('Centralizar no mapa: 1. Chegada')
  })

  test('a coordenada nunca sai no markup, nem em dica nem em rótulo', () => {
    const html = render({ permissions: FULL_ACCESS, seeded: true })

    for (const digits of ['21.123456', '47.654321', '-21.2', '-47.6', '21,123456']) {
      expect(html).not.toContain(digits)
    }
  })

  test('sem trip.event-location: aviso claro, só paradas, nenhum evento listado', () => {
    const html = render({ permissions: READ_ONLY, seeded: true })

    expect(html).toContain('Posição dos eventos oculta')
    expect(html).toContain('Parada da nota: 1 · Armazém Central')
    expect(html).toContain('1 parada no mapa')
    expect(html).not.toContain('Esta ocorrência')
    expect(html).not.toContain('Sem posição: o aparelho')
    expect(html).not.toContain('21.123456')
  })

  test('nenhum evento com posição: diz isso em palavras, e a parada da nota continua nomeada', () => {
    const html = render({
      items: [{ ...ITEMS[2]!, id: 'only-unavailable' }],
      permissions: FULL_ACCESS,
      seeded: true,
    })

    expect(html).toContain('Nenhum evento desta viagem tem posição registrada')
    expect(html).toContain('Sem posição: o aparelho não a entregou.')
    expect(html).toContain('Parada da nota: 1 · Armazém Central')
  })
})
