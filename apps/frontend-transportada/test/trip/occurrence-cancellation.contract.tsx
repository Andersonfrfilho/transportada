/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { AUTH_ME_QUERY_KEY } from '@/modules/identity/queries/useAuthMe.query'
import { formatMomentWithLocale } from '@/modules/shared/momentFormat.service'
import { OccurrenceTimelinePanel } from '@/modules/trip/components/OccurrenceTimeline.component'
import { TripOccurrenceTable } from '@/modules/trip/components/TripOccurrenceTable.component'
import { TripTimelineEntry } from '@/modules/trip/components/TripTimeline.component'
import type { TripOccurrenceTableController } from '@/modules/trip/hooks/useTripOccurrenceTable.hook'
import { TripOccurrenceDetailPage } from '@/modules/trip/pages/TripOccurrenceDetail.page'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'
import { resolveOccurrenceCancellationMark } from '@/modules/trip/shared/occurrenceCancellation.service'
import type { OccurrenceCancellation, TripTimelineItem } from '@/modules/trip/shared/trip.types'
import type { TripOccurrenceFeedItem } from '@/modules/trip/shared/tripOccurrenceFeed.service'
import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import type { OccurrenceTimeline } from '@/modules/trip/shared/tripOccurrenceTimeline.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const CANCELLED_AT = '2026-10-02T10:00:00.000Z'
const REASON = 'Lançada na nota errada'
const CANCELLATION: OccurrenceCancellation = {
  cancelledAt: CANCELLED_AT,
  cancelledByName: 'Operadora Lima',
  reason: REASON,
}
const MOMENT = formatMomentWithLocale({ locale: 'pt-BR', value: CANCELLED_AT })
const AUTHORSHIP_TEXT = `Cancelada por Operadora Lima em ${MOMENT}`
const REASON_TEXT = `Motivo: ${REASON}`
const adapters = createTripResponseAdapters()

function fakeTranslate(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key
  const entries = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',')
  return `${key}(${entries})`
}

const PARAMS = { formatMoment: (value: string) => `<${value}>`, translate: fakeTranslate }

describe('a conta única da marca de cancelada (spec 240 T3.2, RF6)', () => {
  test('ativa e ausente leem igual: nenhuma marca', () => {
    expect(resolveOccurrenceCancellationMark(null, PARAMS)).toBeNull()
    expect(resolveOccurrenceCancellationMark(undefined, PARAMS)).toBeNull()
  })

  test('cancelada: rótulo, autoria, motivo e resumo, todos por chave de tradução', () => {
    const authorship = `occurrenceCancellation.authorship(moment=<${CANCELLED_AT}>,name=Operadora Lima)`
    const reason = `occurrenceCancellation.reason(reason=${REASON})`
    expect(resolveOccurrenceCancellationMark(CANCELLATION, PARAMS)).toEqual({
      authorship,
      label: 'occurrenceCancellation.label',
      reason,
      summary: `occurrenceCancellation.summary(authorship=${authorship},reason=${reason})`,
    })
  })

  test('sem autor (vínculo inativo), a autoria é a frase sem nome — nunca "null"', () => {
    const mark = resolveOccurrenceCancellationMark(
      { ...CANCELLATION, cancelledByName: null },
      PARAMS,
    )
    expect(mark?.authorship).toBe(
      `occurrenceCancellation.authorshipUnknown(moment=<${CANCELLED_AT}>)`,
    )
    expect(mark?.authorship).not.toContain('null')
  })
})

function buildTimelineItem(occurrence: Record<string, unknown> | null): Record<string, unknown> {
  return {
    actorName: 'Marina Alves',
    channel: 'office',
    closeReason: null,
    document: { id: 'doc-1', number: '123', series: '1' },
    fromStatus: null,
    id: 'occurrence-1',
    kind: 'document.occurrence',
    location: null,
    locationState: null,
    occurrence,
    occurredAt: '2026-10-01T10:00:00.000Z',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }
}

function readTimelineItem(occurrence: Record<string, unknown> | null): TripTimelineItem {
  const [item] = adapters.tripTimelineFromApi({
    items: [buildTimelineItem(occurrence)],
    nextCursor: null,
  }).items
  if (item === undefined) throw new Error('EXPECTED_ITEM')
  return item
}

describe('a linha do tempo da viagem valida cancellation (spec 240 T3.2, RF9)', () => {
  const BASE = { attachmentCount: 0, note: 'caixa avariada', typeName: 'Avaria' }

  test('presente e válido atravessa intacto', () => {
    expect(
      readTimelineItem({ ...BASE, cancellation: CANCELLATION }).occurrence?.cancellation,
    ).toEqual(CANCELLATION)
  })

  test('campo ausente (API anterior) lê como null', () => {
    expect(readTimelineItem(BASE).occurrence?.cancellation).toBeNull()
  })

  test('null explícito é ocorrência ativa', () => {
    expect(readTimelineItem({ ...BASE, cancellation: null }).occurrence?.cancellation).toBeNull()
  })

  test('presente e malformado reprova a página, sem virar null calado', () => {
    for (const cancellation of [
      { cancelledAt: CANCELLED_AT, cancelledByName: 'X' },
      { ...CANCELLATION, reason: 3 },
      'cancelada',
    ]) {
      expect(() => readTimelineItem({ ...BASE, cancellation })).toThrow()
    }
  })

  test('autor nulo é válido: a API publica null quando o vínculo já não está ativo', () => {
    const item = readTimelineItem({
      ...BASE,
      cancellation: { ...CANCELLATION, cancelledByName: null },
    })
    expect(item.occurrence?.cancellation?.cancelledByName).toBeNull()
  })
})

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000235'
const CANCELLED_EVENT = {
  actor: { kind: 'operation', name: 'Operadora Lima' },
  id: `occurrence.cancelled:${OCCURRENCE_ID}`,
  isKey: false,
  kind: 'occurrence.cancelled',
  occurredAt: CANCELLED_AT,
  reason: REASON,
  sincePreviousSeconds: 3600,
} as const
const RECORDED_EVENT = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: `occurrence.recorded:${OCCURRENCE_ID}`,
  isKey: true,
  kind: 'occurrence.recorded',
  occurredAt: '2026-10-02T09:00:00.000Z',
  sincePreviousSeconds: null,
} as const
const TIMELINE: OccurrenceTimeline = {
  events: [RECORDED_EVENT, CANCELLED_EVENT],
  timings: {
    contractorAskedAt: null,
    contractorRepliedAt: null,
    driverReleasedAt: null,
    openSince: RECORDED_EVENT.occurredAt,
    openUntil: null,
  },
}

describe('a linha do tempo da ocorrência valida occurrence.cancelled (spec 240 T3.2)', () => {
  function readTimeline(events: readonly unknown[]): Promise<OccurrenceTimeline> {
    return createTripOccurrenceFeedClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(Response.json({ data: { ...TIMELINE, events } })),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    }).readOccurrenceTimeline({ occurrenceId: OCCURRENCE_ID })
  }

  test('o evento com motivo é aceito', async () => {
    expect((await readTimeline([RECORDED_EVENT, CANCELLED_EVENT])).events).toHaveLength(2)
  })

  test('o evento sem motivo reprova a resposta', () => {
    return expect(
      readTimeline([RECORDED_EVENT, { ...CANCELLED_EVENT, reason: undefined }]),
    ).rejects.toThrow()
  })
})

const IDENTITY_ENVIRONMENT = {
  VITE_API_URL: 'https://api.example.test',
  VITE_APP_URL: 'https://app.example.test',
  VITE_KEYCLOAK_CLIENT_ID: 'synthetic-client',
  VITE_KEYCLOAK_REALM: 'synthetic-realm',
  VITE_KEYCLOAK_URL: 'https://keycloak.example.test',
} as const

/** O leitor de ambiente da identidade exige estas variáveis; restaura para não vazar para outras suítes. */
function renderWithQueries(
  element: ReactElement,
  seed: (client: QueryClient) => void = () => undefined,
): string {
  const previous = Object.entries(IDENTITY_ENVIRONMENT).map(
    ([name]) => [name, process.env[name]] as const,
  )
  Object.assign(process.env, IDENTITY_ENVIRONMENT)
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seed(client)
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    )
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function expectCancelledMarkup(markup: string): void {
  expect(markup).toContain('Cancelada')
  expect(markup).toContain(REASON)
}

function expectActiveMarkup(markup: string): void {
  expect(markup).not.toContain('Cancelada')
  expect(markup).not.toContain('Motivo:')
}

describe('o detalhe mostra a marca de cancelada (CA06)', () => {
  function renderDetail(cancellation: null | OccurrenceCancellation): string {
    return renderWithQueries(<TripOccurrenceDetailPage occurrenceId="occurrence-1" />, (client) => {
      client.setQueryData(AUTH_ME_QUERY_KEY, {
        data: { company: { id: 'company-1' }, permissions: ['fleet.read'] },
      })
      client.setQueryData(
        [TRIP_OCCURRENCE_FEED_QUERY_KEY, 'detail', 'company-1', 'occurrence-1'],
        buildOccurrenceDetailFixture({ cancellation }),
      )
    })
  }

  test('com cancelamento: o texto Cancelada, quem cancelou, a hora e o motivo', () => {
    const markup = renderDetail(CANCELLATION)
    expect(markup).toContain(AUTHORSHIP_TEXT)
    expect(markup).toContain(REASON_TEXT)
    expectCancelledMarkup(markup)
  })

  test('ativa: nenhuma marca', () => {
    expect(renderDetail(null)).not.toContain(REASON_TEXT)
    expect(renderDetail(null)).not.toContain('Cancelada por')
  })
})

describe('o feed mostra a marca de cancelada (CA06)', () => {
  function renderFeed(cancellation: null | OccurrenceCancellation): string {
    const item: TripOccurrenceFeedItem = buildOccurrenceDetailFixture({ cancellation })
    const table = {
      expandedId: null,
      fetchNextPage: () => undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      items: [item],
      order: 'desc',
      toggleExpanded: () => undefined,
      toggleOrder: () => undefined,
      visibleColumns: ['createdAt', 'typeName'],
    } as unknown as TripOccurrenceTableController
    return renderToStaticMarkup(
      <TripOccurrenceTable canResolveOccurrenceCases={false} table={table} />,
    )
  }

  test('a cancelada continua listada, com o selo em texto e o motivo para leitor de tela', () => {
    const markup = renderFeed(CANCELLATION)
    expect(markup).toContain('Cancelada')
    expect(markup).toContain(`${AUTHORSHIP_TEXT}. ${REASON_TEXT}`)
    expect(markup.match(/Cancelada<\/span>/gu)?.length).toBeGreaterThanOrEqual(2)
  })

  test('ativa: nenhum selo', () => {
    expectActiveMarkup(renderFeed(null))
  })
})

describe('a linha do tempo da viagem mostra a marca de cancelada (CA06)', () => {
  function renderEntry(cancellation: null | OccurrenceCancellation): string {
    const item = readTimelineItem({
      attachmentCount: 0,
      cancellation,
      note: '',
      typeName: 'Avaria',
    })
    return renderWithQueries(
      <TripTimelineEntry elapsedMinutes={null} item={item} repeatsAuthorship={false} stops={[]} />,
    )
  }

  test('cancelada: selo, autoria e motivo à vista, sem precisar expandir', () => {
    const markup = renderEntry(CANCELLATION)
    expect(markup).toContain(AUTHORSHIP_TEXT)
    expect(markup).toContain(REASON_TEXT)
    expectCancelledMarkup(markup)
  })

  test('ativa: nenhuma marca', () => {
    expectActiveMarkup(renderEntry(null))
  })
})

describe('a linha do tempo da ocorrência mostra o cancelamento (CA06)', () => {
  function renderPanel(timeline: OccurrenceTimeline): string {
    return renderWithQueries(<OccurrenceTimelinePanel occurrenceId={OCCURRENCE_ID} />, (client) => {
      client.setQueryData(
        [TRIP_OCCURRENCE_FEED_QUERY_KEY, 'timeline', undefined, OCCURRENCE_ID],
        timeline,
      )
    })
  }

  test('o evento diz Ocorrência cancelada, com autor, hora e motivo', () => {
    const markup = renderPanel(TIMELINE)
    expect(markup).toContain('Ocorrência cancelada')
    expect(markup).toContain('Operadora Lima')
    expect(markup).toContain(REASON_TEXT)
    expect(markup).toContain(formatMomentWithLocale({ locale: 'pt-BR', value: CANCELLED_AT }))
  })

  test('sem o evento, nada de cancelamento', () => {
    expectActiveMarkup(renderPanel({ ...TIMELINE, events: [RECORDED_EVENT] }))
  })
})
