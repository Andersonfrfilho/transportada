/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §7 / spec 196 D9 (T3.4): todo toque novo do motorista tem de carimbar o ponto. O defeito
 * que isto impede é silencioso — alguém acrescenta uma rota `POST` sob `/me/trips/current`, a app
 * passa a usá-la, e ela grava evento sem ponto para sempre, sem erro em lugar nenhum.
 *
 * A lista de rotas vem das fábricas (`createMeTripRoutes` e as irmãs que também montam caminho
 * sob a viagem atual), não de texto. Cada `POST` está na tabela de amostras — e então **aceita
 * `location` de verdade**, provado pelo comportamento da rota — ou nas exceções, com o motivo.
 */
import { describe, expect, test } from 'bun:test'

import { defineRoute, type RegisteredRouterRoute } from '../../src/http/router.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import { DRIVER_RETURN_REASONS } from '../../src/trips/domain/driver-return-reason.policy.js'
import { createMeLocationRoutes } from '../../src/trips/presentation/me-location.routes.js'
import { createMeProofReceiverRoutes } from '../../src/trips/presentation/me-proof-receiver.routes.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { send } from '../fixtures/driver-route-request.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c1'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TAPPED_AT = '2026-10-02T11:59:00.000Z'
const CURRENT_TRIP_PATH = '/me/trips/current'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const VALID_LOCATION = {
  accuracyMeters: 12.5,
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: -23.55052,
  longitude: -46.633309,
}
const PARTIAL_LOCATION = { latitude: -23.55052 }

type RouteKey = `${string} ${string}`

type TapSample = {
  /** O corpo mínimo válido da rota, sem `location`. */
  readonly body: Record<string, unknown>
  readonly pathname: string
}

type InventoryException = {
  readonly pathname: string
  readonly reason: string
  /** A rota ainda não existe (spec 192): a exceção vale quando ela nascer. */
  readonly whenPresent?: true
}

/** Toda rota sob a viagem atual que é **toque** do motorista e, portanto, carimba o ponto. */
const TAP_SAMPLES: TapSample[] = [
  { body: { tripId: TRIP_ID }, pathname: `${CURRENT_TRIP_PATH}/dispatch` },
  { body: {}, pathname: `${CURRENT_TRIP_PATH}/confirm-load` },
  { body: {}, pathname: `${CURRENT_TRIP_PATH}/start-route` },
  { body: {}, pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/arrive` },
  { body: { tappedAt: TAPPED_AT }, pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/depart` },
  {
    body: { tappedAt: TAPPED_AT },
    pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/cancel-departure`,
  },
  { body: {}, pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/deliver` },
  {
    body: { reason: DRIVER_RETURN_REASONS[0] },
    pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/return`,
  },
  { body: { kind: 'other' }, pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/occurrences` },
  {
    body: { note: 'recusou', occurrenceTypeId: OCCURRENCE_TYPE_ID, productCode: '' },
    pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/occurrences`,
  },
]

/** As que não aceitam `location`, e por quê. Rota sem motivo escrito não entra aqui. */
const EXCEPTIONS: readonly InventoryException[] = [
  {
    pathname: `${CURRENT_TRIP_PATH}/location`,
    reason: 'é a posição ao vivo com consentimento (ADR-0050 §5), não um toque',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/proof`,
    reason: 'multipart com os próprios campos de posição (ADR-0070)',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/occurrence-uploads`,
    reason: 'anexo, não evento (D6)',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/documents/:documentId/occurrence-uploads/:uploadId/confirm`,
    reason: 'anexo, não evento (D6)',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/occurrence-uploads`,
    reason: 'anexo, não evento (D6) — a foto do "Deu problema" (spec 209)',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/occurrence-uploads/:uploadId/confirm`,
    reason: 'anexo, não evento (D6) — a foto do "Deu problema" (spec 209)',
  },
  {
    pathname: `${CURRENT_TRIP_PATH}/stop-order-suggestions`,
    reason: 'coordenada efêmera do solver (ADR-0077 §10), não um toque',
    whenPresent: true,
  },
]

function buildDriverRoutes(): readonly RegisteredRouterRoute[] {
  return [
    ...createMeTripRoutes({
      attachProof: NOT_CALLED,
      cancelStopDeparture: NOT_CALLED,
      confirmOccurrenceUpload: NOT_CALLED,
      createOccurrenceUpload: NOT_CALLED,
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: NOT_CALLED,
      readDeliveryProofs: NOT_CALLED,
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: NOT_CALLED,
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: NOT_CALLED,
      reportDeparture: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveDriverId: async () => DRIVER_ID,
      startFieldTrip: NOT_CALLED,
    }),
    ...createMeLocationRoutes({
      readConsent: NOT_CALLED,
      recordLocation: NOT_CALLED,
      resolveDriverId: async () => DRIVER_ID,
      setConsent: NOT_CALLED,
    }),
    ...createMeProofReceiverRoutes({
      resolveDriverId: async () => DRIVER_ID,
      updateProofReceiver: NOT_CALLED,
    }),
  ]
}

function keyOf(route: { readonly method: string; readonly pathname: string }): RouteKey {
  return `${route.method} ${route.pathname}`
}

function listCurrentTripPosts(
  routes: readonly RegisteredRouterRoute[],
): readonly RegisteredRouterRoute[] {
  return routes.filter(
    (route) => route.method === 'POST' && route.pathname.startsWith(CURRENT_TRIP_PATH),
  )
}

/** As rotas `POST` que não estão nem na tabela de amostras nem nas exceções. */
function findUninventoried(routes: readonly RegisteredRouterRoute[]): readonly RouteKey[] {
  const known = new Set<string>([
    ...TAP_SAMPLES.map((sample) => `POST ${sample.pathname}`),
    ...EXCEPTIONS.map((exception) => `POST ${exception.pathname}`),
  ])

  return listCurrentTripPosts(routes)
    .map(keyOf)
    .filter((key) => !known.has(key))
    .toSorted((left, right) => left.localeCompare(right))
}

type Outcome = 'accepted' | 'rejected-in-location' | 'rejected-elsewhere'

/**
 * Manda a amostra com o `location` dado e classifica o que o `parse` fez. Passar do `parse` e tocar
 * a dependência (que lança de propósito) é `accepted`: o que interessa é só a fronteira.
 */
async function probe(
  route: RegisteredRouterRoute,
  body: Record<string, unknown>,
): Promise<Outcome> {
  try {
    await send({
      body,
      pathParameters: {
        documentId: DOCUMENT_ID,
        stopId: STOP_ID,
        uploadId: DOCUMENT_ID,
      },
      route,
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      const isLocationField = error.details?.some((detail) => detail.field.startsWith('location'))
      return isLocationField === true ? 'rejected-in-location' : 'rejected-elsewhere'
    }
  }

  return 'accepted'
}

/** `true` quando a rota honra o contrato do D9 para a amostra. */
async function acceptsLocation(route: RegisteredRouterRoute, sample: TapSample): Promise<boolean> {
  const baseline = await probe(route, sample.body)
  const withLocation = await probe(route, { ...sample.body, location: VALID_LOCATION })
  const withPartial = await probe(route, { ...sample.body, location: PARTIAL_LOCATION })

  return (
    baseline === 'accepted' && withLocation === 'accepted' && withPartial === 'rejected-in-location'
  )
}

const routes = buildDriverRoutes()

describe('inventário das rotas de toque do motorista (196 D9)', () => {
  test('a lista vem das fábricas e tem as rotas POST do campo', () => {
    const posts = listCurrentTripPosts(routes).map(keyOf)

    expect(posts.length).toBeGreaterThanOrEqual(TAP_SAMPLES.length)
    expect(posts).toContain(`POST ${CURRENT_TRIP_PATH}/dispatch`)
    expect(posts).toContain(`POST ${CURRENT_TRIP_PATH}/location`)
  })

  test('toda rota POST sob a viagem atual está na tabela de amostras ou nas exceções', () => {
    expect(findUninventoried(routes)).toEqual([])
  })

  test('uma rota falsa, sem location e fora das duas listas, reprova', () => {
    const fake = defineRoute({
      handle: async () => new Response(null, { status: 204 }),
      method: 'POST',
      parse: () => undefined,
      pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/pause`,
    })

    expect(findUninventoried([...routes, fake])).toEqual([
      `POST ${CURRENT_TRIP_PATH}/stops/:stopId/pause`,
    ])
  })

  test('amostra e exceção não se sobrepõem', () => {
    const sampled = new Set(TAP_SAMPLES.map((sample) => sample.pathname))

    expect(EXCEPTIONS.filter((exception) => sampled.has(exception.pathname))).toEqual([])
  })

  test('toda exceção traz o motivo escrito', () => {
    expect(EXCEPTIONS.filter((exception) => exception.reason.trim() === '')).toEqual([])
  })

  test('nenhuma entrada das duas listas aponta para rota que não existe, salvo a que ainda vai nascer', () => {
    const existing = new Set(listCurrentTripPosts(routes).map((route) => route.pathname))
    const dead = [
      ...TAP_SAMPLES.map((sample) => sample.pathname),
      ...EXCEPTIONS.filter((exception) => exception.whenPresent !== true).map(
        (exception) => exception.pathname,
      ),
    ].filter((pathname) => !existing.has(pathname))

    expect(dead).toEqual([])
  })
})

describe('toda amostra aceita location de verdade, e recusa a metade (196 D9)', () => {
  test.each(TAP_SAMPLES)('$pathname', async (sample) => {
    const route = listCurrentTripPosts(routes).find(
      (candidate) => candidate.pathname === sample.pathname,
    )
    if (route === undefined) throw new Error(`ROUTE_NOT_FOUND:${sample.pathname}`)

    expect(await probe(route, sample.body)).toBe('accepted')
    expect(await probe(route, { ...sample.body, location: VALID_LOCATION })).toBe('accepted')
    expect(await probe(route, { ...sample.body, location: PARTIAL_LOCATION })).toBe(
      'rejected-in-location',
    )
  })

  test('uma rota que ignora o corpo não passa por aceitar location: o parcial a denuncia', async () => {
    const permissive = defineRoute({
      handle: async () => new Response(null, { status: 204 }),
      method: 'POST',
      parse: () => undefined,
      pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/pause`,
    })

    expect(
      await acceptsLocation(permissive, {
        body: {},
        pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/pause`,
      }),
    ).toBe(false)
  })

  test('uma rota estrita que não conhece location também não passa: a chave desconhecida a denuncia', async () => {
    const strictWithoutLocation = defineRoute({
      handle: async () => new Response(null, { status: 204 }),
      method: 'POST',
      parse: ({ request }) =>
        request.json().then((raw: unknown) => {
          const body = raw as Record<string, unknown>
          if (Object.keys(body).length > 0) {
            throw new ApiError({
              code: 'INVALID_REQUEST',
              details: [{ field: '', message: 'Unrecognized key' }],
              message: 'Invalid request',
              status: 400,
            })
          }
        }),
      pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/strict`,
    })

    expect(
      await acceptsLocation(strictWithoutLocation, {
        body: {},
        pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/strict`,
      }),
    ).toBe(false)
  })

  test('uma rota que aceita location por inteiro e recusa a metade passa', async () => {
    const honest = defineRoute({
      handle: async () => new Response(null, { status: 204 }),
      method: 'POST',
      parse: ({ request }) =>
        request.json().then((raw: unknown) => {
          const body = raw as Record<string, unknown>
          const location = body.location
          if (location !== undefined && !('capturedAt' in (location as object))) {
            throw new ApiError({
              code: 'INVALID_REQUEST',
              details: [{ field: 'location.capturedAt', message: 'Required' }],
              message: 'Invalid request',
              status: 400,
            })
          }
        }),
      pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/honest`,
    })

    expect(
      await acceptsLocation(honest, {
        body: {},
        pathname: `${CURRENT_TRIP_PATH}/stops/:stopId/honest`,
      }),
    ).toBe(true)
  })
})
