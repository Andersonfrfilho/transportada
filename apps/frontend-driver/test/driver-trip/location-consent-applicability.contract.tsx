/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { DriverLocationConsentCard } from '@/modules/driver-trip/components/DriverLocationConsentCard.component'
import {
  LOCATION_CONSENT_QUERY_KEY,
  useLocationConsent,
  type LocationConsentState,
} from '@/modules/driver-trip/hooks/useLocationConsent.hook'
import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import { DriverTripRequestError } from '@/modules/driver-trip/shared/driverTripClient.service'

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
}

async function failReading(client: QueryClient, status: number): Promise<void> {
  await client
    .fetchQuery({
      queryFn: () =>
        Promise.reject(new DriverTripRequestError({ code: 'ANY', isOffline: false, status })),
      queryKey: LOCATION_CONSENT_QUERY_KEY,
    })
    .catch(() => undefined)
}

function renderCard(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <DriverLocationConsentCard />
    </QueryClientProvider>,
  )
}

function readHook(client: QueryClient): LocationConsentState {
  let captured: LocationConsentState | undefined
  function Probe() {
    captured = useLocationConsent()
    return null
  }
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  )
  if (captured === undefined) throw new Error('HOOK_NOT_RENDERED')
  return captured
}

describe('o cartão de consentimento só existe para quem a API atende (spec 244 D1)', () => {
  test('403 na leitura: sem cartão, sem alerta e sem botão', async () => {
    const client = buildClient()
    await failReading(client, 403)

    const html = renderCard(client)

    expect(html).toBe('')
  })

  test('403 na leitura: o hook diz que não se aplica e não grava nada', async () => {
    const client = buildClient()
    await failReading(client, 403)

    const state = readHook(client)
    state.setConsent(true)

    expect(state.isApplicable).toBe(false)
    expect(state.isFailed).toBe(false)
    expect(client.getMutationCache().getAll()).toHaveLength(0)
  })

  test('consentimento lido: o cartão aparece como hoje', () => {
    const client = buildClient()
    client.setQueryData(LOCATION_CONSENT_QUERY_KEY, { acceptedAt: null })

    const html = renderCard(client)

    expect(readHook(client).isApplicable).toBe(true)
    expect(html).toContain(ptLocale.locationSharing.title)
    expect(html).toContain('role="switch"')
  })

  test('erro de servidor (500): o cartão aparece com o erro', async () => {
    const client = buildClient()
    await failReading(client, 500)

    const html = renderCard(client)

    expect(readHook(client).isApplicable).toBe(true)
    expect(html).toContain(ptLocale.locationSharing.title)
    expect(html).toContain('role="alert"')
    expect(html).toContain(ptLocale.locationSharing.loadFailed)
  })

  test('falha de rede: o cartão aparece com o erro', async () => {
    const client = buildClient()
    await client
      .fetchQuery({
        queryFn: () =>
          Promise.reject(new DriverTripRequestError({ code: 'NETWORK', isOffline: true })),
        queryKey: LOCATION_CONSENT_QUERY_KEY,
      })
      .catch(() => undefined)

    const html = renderCard(client)

    expect(html).toContain(ptLocale.locationSharing.loadFailed)
  })
})
