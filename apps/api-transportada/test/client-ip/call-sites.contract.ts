/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0076 §6: o resolvedor configurado chega a todo ponto que grava IP em trilha ou chaveia limite.
 * Um ponto que importasse um resolvedor próprio voltaria a ler o começo de `x-forwarded-for`, que é
 * do cliente. Cada rota recebe uma cadeia forjada e tem de cair no `x-real-ip` do edge.
 *
 * O resolvedor injetado lança o IP que resolveu: prova que a rota o chamou, com a requisição que
 * recebeu, sem depender do resto do caminho.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createAggregateAccountPublicRoutes } from '../../src/fleet/presentation/aggregate-account.routes.js'
import {
  type ClientIpResolver,
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
import { createRouter, defineAnonymousRoute } from '../../src/http/router.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripFieldOfficeOccurrenceRoutes } from '../../src/trips/presentation/trip-field-office-occurrence.routes.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const EDGE_IP = '198.51.100.7'
const FORGED_CHAIN = `203.0.113.1, ${EDGE_IP}`
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const TYPE_ID = '00000000-0000-4000-8000-000000000007'

class ResolvedClientIp extends Error {
  public constructor(public readonly clientIp: string) {
    super('CLIENT_IP_RESOLVED')
  }
}

const configured = createClientIpResolver(DEFAULT_CLIENT_IP_POLICY)
const resolveAndStop: ClientIpResolver = (request) => {
  throw new ResolvedClientIp(configured(request))
}

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: '00000000-0000-4000-8000-000000000001',
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function forgedHeaders(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { 'x-forwarded-for': FORGED_CHAIN, 'x-real-ip': EDGE_IP, ...extra }
}

function jsonRequest(body: object | undefined): Request {
  return new Request('http://localhost/trips/x', {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: forgedHeaders({
      'content-type': 'application/json',
      'idempotency-key': 'client-ip-contract',
    }),
    method: 'POST',
  })
}

async function resolvedIpOf(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    if (error instanceof ResolvedClientIp) return error.clientIp
    throw error
  }
  throw new Error('EXPECTED_THE_ROUTE_TO_RESOLVE_THE_CLIENT_IP')
}

function officeRoutes() {
  return createTripFieldOfficeRoutes({
    attachProof: NOT_CALLED,
    reportArrival: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveClientIp: resolveAndStop,
    startFieldTrip: NOT_CALLED,
    targets: { findTripCrew: NOT_CALLED },
  })
}

function findRoute<TRoute extends { readonly method: string; readonly pathname: string }>(
  routes: readonly TRoute[],
  pathname: string,
): TRoute {
  const route = routes.find(
    (candidate) => candidate.method === 'POST' && candidate.pathname === pathname,
  )
  if (route === undefined) throw new Error(`route missing: ${pathname}`)
  return route
}

function executeOffice(input: {
  readonly pathname: string
  readonly pathParameters: Readonly<Record<string, string>>
  readonly request: Request
}): Promise<Response> {
  return findRoute(officeRoutes(), input.pathname).execute({
    context: context(),
    correlationId: 'client-ip-contract',
    pathParameters: input.pathParameters,
    request: input.request,
  })
}

describe('os oito pontos de chamada usam o resolvedor configurado (ADR-0076 §6)', () => {
  test('trip.routes: encerrar a viagem', async () => {
    const routes = createTripRoutes({ resolveClientIp: resolveAndStop } as never)
    const route = findRoute(routes, '/trips/:id/close')

    const clientIp = await resolvedIpOf(
      route.execute({
        context: context(),
        correlationId: 'client-ip-contract',
        pathParameters: { id: TRIP_ID },
        request: jsonRequest({}),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('escritório: confirm-load e start-route', async () => {
    for (const pathname of ['/trips/:id/confirm-load', '/trips/:id/start-route']) {
      const clientIp = await resolvedIpOf(
        executeOffice({ pathParameters: { id: TRIP_ID }, pathname, request: jsonRequest({}) }),
      )
      expect(clientIp).toBe(EDGE_IP)
    }
  })

  test('escritório: chegada na parada', async () => {
    const clientIp = await resolvedIpOf(
      executeOffice({
        pathParameters: { id: TRIP_ID, stopId: STOP_ID },
        pathname: '/trips/:id/stops/:stopId/arrive',
        request: jsonRequest({}),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('escritório: ocorrência de parada', async () => {
    const clientIp = await resolvedIpOf(
      executeOffice({
        pathParameters: { id: TRIP_ID, stopId: STOP_ID },
        pathname: '/trips/:id/stops/:stopId/occurrences',
        request: jsonRequest({ kind: 'long_wait' }),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('escritório: baixa de nota (devolução)', async () => {
    const clientIp = await resolvedIpOf(
      executeOffice({
        pathParameters: { documentId: DOCUMENT_ID, id: TRIP_ID },
        pathname: '/trips/:id/documents/:documentId/field-return',
        request: jsonRequest({ reason: 'recipient_absent' }),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('escritório: ocorrências em lote', async () => {
    const routes = createTripFieldOfficeOccurrenceRoutes({
      listFieldOccurrenceTypes: NOT_CALLED,
      registerOccurrences: NOT_CALLED,
      resolveClientIp: resolveAndStop,
      targets: { findTripCrew: NOT_CALLED },
    })
    const form = new FormData()
    form.append('documentIds', DOCUMENT_ID)
    form.set('occurrenceTypeId', TYPE_ID)
    form.set('note', 'Portão fechado')

    const clientIp = await resolvedIpOf(
      findRoute(routes, '/trips/:id/documents/field-occurrences').execute({
        context: context(),
        correlationId: 'client-ip-contract',
        pathParameters: { id: TRIP_ID },
        request: new Request('http://localhost/trips/x/documents/field-occurrences', {
          body: form,
          headers: forgedHeaders({ 'idempotency-key': 'client-ip-contract' }),
          method: 'POST',
        }),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('agregado: cadastro de conta (rota anônima)', async () => {
    const [route] = createAggregateAccountPublicRoutes({
      aggregateAccounts: { register: NOT_CALLED } as never,
      resolveClientIp: resolveAndStop,
    })

    const clientIp = await resolvedIpOf(
      route!.execute({
        correlationId: 'client-ip-contract',
        pathParameters: {},
        request: new Request('http://localhost/public/aggregate-accounts', {
          body: JSON.stringify({
            email: 'agregado@empresa.test',
            name: 'Agregado de Teste',
            password: 'senha-de-teste-longa',
            taxId: '52998224725',
          }),
          headers: forgedHeaders({ 'content-type': 'application/json' }),
          method: 'POST',
        }),
      }),
    )

    expect(clientIp).toBe(EDGE_IP)
  })

  test('roteador: a chave do limitador anônimo', async () => {
    const resolved: string[] = []
    const router = createRouter({
      anonymousRoutes: [
        defineAnonymousRoute({
          handle: async () => new Response(null, { status: 204 }),
          method: 'POST',
          parse: () => undefined,
          pathname: '/client-ip-contract/anonymous',
          rateLimit: { maxRequests: 1, windowMs: 60_000 },
        }),
      ],
      authentication: { authenticate: NOT_CALLED },
      authorization: { authorize: NOT_CALLED },
      companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
      healthService: new HealthService({
        database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
        identityReadiness: { checkReadiness: async () => true },
        migrationStatus: appliedMigrations(),
        now: () => new Date('2026-09-25T12:00:00.000Z'),
      }),
      resolveClientIp: (request) => {
        const clientIp = configured(request)
        resolved.push(clientIp)
        return clientIp
      },
      routes: [],
      tenantContext: { resolveCompany: NOT_CALLED },
      userPictureExistence: stubUserPictureExistence(),
    })
    const send = (forged: string) =>
      router.handle({
        correlationId: 'client-ip-contract',
        method: 'POST',
        pathname: '/client-ip-contract/anonymous',
        request: new Request('http://localhost/client-ip-contract/anonymous', {
          headers: { 'x-forwarded-for': `${forged}, ${EDGE_IP}`, 'x-real-ip': EDGE_IP },
          method: 'POST',
        }),
      })

    expect((await send('203.0.113.1')).status).toBe(204)
    const second = await send('203.0.113.2').then(
      (response) => response.status,
      (error: unknown) => (error as { readonly status?: number }).status,
    )

    expect(second).toBe(429)
    expect(resolved).toEqual([EDGE_IP, EDGE_IP])
  })
})
