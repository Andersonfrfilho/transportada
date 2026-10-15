/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceResolutionPanel } from '@/modules/trip/components/OccurrenceResolutionPanel.component'
import { resolveOccurrenceResolutionFeedback } from '@/modules/trip/shared/occurrenceResolution.service'
import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000266'
const ACCESS_TOKEN = 'synthetic-token'
const NOTE = 'Conferido com o cliente; pode seguir.'
const RESOLVED = {
  note: NOTE,
  occurrenceId: OCCURRENCE_ID,
  occurrenceKind: 'stop',
  resolvedAt: '2026-10-15T10:00:00.000Z',
  state: 'resolved',
} as const

function createClient(input: { readonly requests: Request[]; readonly response?: Response }) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: (resource, init) => {
      input.requests.push(new Request(resource, init))
      return Promise.resolve(input.response ?? Response.json({ data: RESOLVED }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  })
}

const IDENTITY_ENVIRONMENT = {
  VITE_API_URL: API_URL,
  VITE_APP_URL: 'https://app.example.test',
  VITE_KEYCLOAK_CLIENT_ID: 'synthetic-client',
  VITE_KEYCLOAK_REALM: 'synthetic-realm',
  VITE_KEYCLOAK_URL: 'https://keycloak.example.test',
} as const

/** O leitor de ambiente da identidade exige estas variáveis; restaura para não vazar para outras suítes. */
function render(props: Parameters<typeof OccurrenceResolutionPanel>[0]): string {
  const previous = Object.entries(IDENTITY_ENVIRONMENT).map(
    ([name]) => [name, process.env[name]] as const,
  )
  Object.assign(process.env, IDENTITY_ENVIRONMENT)
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <OccurrenceResolutionPanel {...props} />
      </QueryClientProvider>,
    )
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

describe('spec 266 T3.1: o painel de resolução', () => {
  test.each(['document', 'stop'] as const)('mostra a ação para a ocorrência de %s', (kind) => {
    const markup = render({ canResolve: true, occurrenceId: OCCURRENCE_ID, occurrenceKind: kind })
    expect(markup).toContain('Resolver com observação')
  })

  test('sem occurrences.resolve a ação some', () => {
    const markup = render({
      canResolve: false,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
    })
    expect(markup).not.toContain('Resolver com observação')
  })

  test('já resolvida ou cancelada não oferece a ação, e o andamento aparece quando conhecido', () => {
    const resolved = render({
      canResolve: true,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'stop',
      state: 'resolved',
    })
    expect(resolved).not.toContain('Resolver com observação')
    expect(resolved).toContain('Resolvida')
    const cancelled = render({
      canResolve: true,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'stop',
      state: 'cancelled',
    })
    expect(cancelled).not.toContain('Resolver com observação')
  })

  test('a nota é obrigatória e o aviso ao motorista está no locale pt-BR e en', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/trip/components/OccurrenceResolutionPanel.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain('note.trim().length === 0')
    for (const [file, text] of [
      ['trip.locale.json', 'O motorista vai ler esta observação.'],
      ['trip.en.locale.json', 'The driver will read this note.'],
    ] as const) {
      const raw = readFileSync(
        new URL(`../../src/modules/trip/locales/${file}`, import.meta.url),
        'utf8',
      )
      expect(raw).toContain(text)
    }
  })
})

describe('spec 266 T3.1: cliente HTTP da resolução', () => {
  test('POST .../trip-occurrences/:kind/:id/resolution com { note } e valida a resposta', async () => {
    const requests: Request[] = []
    const result = await createClient({ requests }).resolveTripOccurrence({
      kind: 'stop',
      note: NOTE,
      occurrenceId: OCCURRENCE_ID,
    })
    expect(result).toEqual(RESOLVED)
    const [request] = requests
    if (request === undefined) throw new Error('RESOLUTION_REQUEST_MISSING')
    expect(request.url).toBe(`${API_URL}/trip-occurrences/stop/${OCCURRENCE_ID}/resolution`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(await request.json()).toEqual({ note: NOTE })
  })

  test('resposta fora do contrato é inválida', async () => {
    const client = createClient({
      requests: [],
      response: Response.json({ data: { state: 'resolved' } }, { status: 201 }),
    })
    const caught = await client
      .resolveTripOccurrence({ kind: 'document', note: NOTE, occurrenceId: OCCURRENCE_ID })
      .catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(Error)
  })

  test.each([
    ['OCCURRENCE_ALREADY_RESOLVED', 'alreadyResolved', true],
    ['OCCURRENCE_CANCELLED', 'cancelled', false],
    ['TRIP_OCCURRENCE_NOT_FOUND', 'generic', false],
  ] as const)('409 %s vira a mensagem %s', async (code, key, shouldRefresh) => {
    const client = createClient({
      requests: [],
      response: Response.json({ error: { code, message: 'x' } }, { status: 409 }),
    })
    const caught = await client
      .resolveTripOccurrence({ kind: 'document', note: NOTE, occurrenceId: OCCURRENCE_ID })
      .catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe(code)
    expect(resolveOccurrenceResolutionFeedback(caught)).toEqual({
      isInformational: key === 'alreadyResolved',
      key,
    })
    expect(shouldRefresh).toBe(key === 'alreadyResolved')
  })
})
