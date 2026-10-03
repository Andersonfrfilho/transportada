/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { AUTH_ME_QUERY_KEY } from '@/modules/identity/queries/useAuthMe.query'
import { TripOccurrenceDetailPage } from '@/modules/trip/pages/TripOccurrenceDetail.page'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const adapters = createTripResponseAdapters()

const IDENTITY_ENVIRONMENT = {
  VITE_API_URL: 'https://api.example.test',
  VITE_APP_URL: 'https://app.example.test',
  VITE_KEYCLOAK_CLIENT_ID: 'synthetic-client',
  VITE_KEYCLOAK_REALM: 'synthetic-realm',
  VITE_KEYCLOAK_URL: 'https://keycloak.example.test',
} as const

function renderDetailFromOldApi(): string {
  const previous = Object.keys(IDENTITY_ENVIRONMENT).map(
    (name) => [name, process.env[name]] as const,
  )
  Object.assign(process.env, IDENTITY_ENVIRONMENT)
  try {
    const oldApiDetail: Record<string, unknown> = { ...buildOccurrenceDetailFixture() }
    delete oldApiDetail.cancellation
    delete oldApiDetail.corrections
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(AUTH_ME_QUERY_KEY, {
      data: { company: { id: 'company-1' }, permissions: ['trip.manage'] },
    })
    client.setQueryData(
      [TRIP_OCCURRENCE_FEED_QUERY_KEY, 'detail', 'company-1', 'occurrence-1'],
      oldApiDetail,
    )
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TripOccurrenceDetailPage occurrenceId="occurrence-1" />
      </QueryClientProvider>,
    )
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

describe('o painel desta branch contra a API anterior (spec 235, ADR-0081 §9)', () => {
  test('o detalhe sem `cancellation` nem `corrections` renderiza ativo, sem histórico', () => {
    const markup = renderDetailFromOldApi()
    expect(markup).toContain('Corrigir')
    expect(markup).not.toContain('Cancelada por')
    expect(markup).not.toContain('Passou a valer')
  })

  test('a lista da nota sem as chaves novas é aceita e não vira cancelada', () => {
    const [occurrence] = adapters.occurrencesFromApi([
      {
        createdAt: '2026-10-01T10:00:00.000Z',
        id: 'occurrence-1',
        note: '',
        occurrenceTypeId: 'type-1',
        productCode: '696',
        productCodes: ['696'],
        stage: 'separation',
        typeName: 'Item avariado',
      },
    ])
    expect(occurrence?.cancellation ?? null).toBeNull()
    expect(occurrence?.corrections ?? []).toEqual([])
  })
})
