/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3: as duas rotas da ocorrência do escritório — a lista de tipos de rua (L2) e o lote
 * (D7). A prova aqui é a fiação: política, corpo validado na borda, alvo resolvido pela empresa do
 * contexto, `audit_logs` com as notas do lote e o envelope de resposta.
 */
import { describe, expect, it } from 'bun:test'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  createTripFieldOfficeOccurrenceRoutes,
  type TripFieldOfficeOccurrenceDependencies,
} from '../../src/trips/presentation/trip-field-office-occurrence.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000a1'
const TYPE_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'

function context(
  roles: CompanyContext['roles'] = ['operator'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: resolveCompanyPermissions(roles),
      roles,
      userId: ACTOR_USER_ID,
    },
  }
}

function jsonRequest(input: { readonly body?: object; readonly idempotencyKey?: string }): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x/documents/field-occurrences', {
    body: JSON.stringify(input.body ?? {}),
    headers: { ...headers, 'x-forwarded-for': '203.0.113.7' },
    method: 'POST',
  })
}

function buildDependencies() {
  const audits: unknown[] = []
  const registered: unknown[] = []
  const dependencies: TripFieldOfficeOccurrenceDependencies = {
    audit: { record: async (input) => void audits.push(input) },
    listFieldOccurrenceTypes: async () => [{ id: TYPE_ID, name: 'Cliente ausente' }],
    registerOccurrences: async (input) => {
      registered.push(input)
      return {
        items: input.documentIds.map((documentId) => ({ documentId, id: `occ-${documentId}` })),
      }
    },
    targets: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus: 'on_delivery_route',
      }),
    },
  }
  return { audits, dependencies, registered }
}

function findRoute(method: string) {
  const { dependencies } = buildDependencies()
  const route = createTripFieldOfficeOccurrenceRoutes(dependencies).find(
    (candidate) => candidate.method === method,
  )
  if (route === undefined) throw new Error('route missing')
  return route
}

async function statusOf(operation: Promise<Response>): Promise<number> {
  try {
    return (await operation).status
  } catch (error) {
    return error instanceof ApiError ? error.status : 500
  }
}

describe('as rotas da ocorrência do escritório (spec 156 T7.3)', () => {
  it('são duas, em /trips, com trip.report-on-behalf', () => {
    const routes = createTripFieldOfficeOccurrenceRoutes(buildDependencies().dependencies)
    expect(routes.map((route) => `${route.method} ${route.pathname}`).toSorted()).toEqual([
      'GET /trips/occurrence-types/field',
      'POST /trips/:id/documents/field-occurrences',
    ])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'trip.report-on-behalf', scope: 'company' })
    }
  })

  it('aceite 1: o separador e o motorista não alcançam nenhuma; operator e finance sim', () => {
    const authorization = new AuthorizationService()
    const routes = createTripFieldOfficeOccurrenceRoutes(buildDependencies().dependencies)
    for (const route of routes) {
      for (const role of ['separator', 'driver', 'viewer'] as const) {
        expect(() => authorization.authorize(context([role]), route.policy)).toThrow()
      }
      for (const role of ['operator', 'finance', 'company-admin'] as const) {
        expect(() => authorization.authorize(context([role]), route.policy)).not.toThrow()
      }
    }
  })

  it('GET devolve só id e nome dos tipos de rua', async () => {
    const response = await findRoute('GET').execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: {},
      request: new Request('http://localhost/trips/occurrence-types/field'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: TYPE_ID, name: 'Cliente ausente' }] })
  })

  it('POST resolve o alvo, registra o lote e audita com as notas', async () => {
    const { audits, dependencies, registered } = buildDependencies()
    const route = createTripFieldOfficeOccurrenceRoutes(dependencies).find(
      (candidate) => candidate.method === 'POST',
    )

    const response = await route!.execute({
      context: context(),
      correlationId: 'c-2',
      pathParameters: { id: TRIP_ID },
      request: jsonRequest({
        body: { documentIds: [DOCUMENT_ID], note: ' Portão fechado ', occurrenceTypeId: TYPE_ID },
        idempotencyKey: 'lote-1',
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      data: { items: [{ documentId: DOCUMENT_ID, id: `occ-${DOCUMENT_ID}` }] },
    })
    expect(registered).toHaveLength(1)
    expect(registered[0]).toMatchObject({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [DOCUMENT_ID],
      idempotencyKey: 'lote-1',
      note: 'Portão fechado',
      occurrenceTypeId: TYPE_ID,
      target: { onBehalfOfDriverId: DRIVER_ID, tripId: TRIP_ID },
    })
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'trip_field_office.document_occurrences',
        documentIds: [DOCUMENT_ID],
        onBehalfOfDriverId: DRIVER_ID,
        tripId: TRIP_ID,
      }),
    ])
  })

  it('POST valida o corpo na borda: vazio, mais de 50, repetido, campo a mais e sem chave → 400', async () => {
    const route = findRoute('POST')
    const call = (body: object, idempotencyKey: string | null = 'lote-1') =>
      route.execute({
        context: context(),
        correlationId: 'c-3',
        pathParameters: { id: TRIP_ID },
        request: jsonRequest(idempotencyKey === null ? { body } : { body, idempotencyKey }),
      })
    const fiftyOne = Array.from({ length: 51 }, () => crypto.randomUUID())

    expect(await statusOf(call({ documentIds: [], occurrenceTypeId: TYPE_ID }))).toBe(400)
    expect(await statusOf(call({ documentIds: fiftyOne, occurrenceTypeId: TYPE_ID }))).toBe(400)
    expect(
      await statusOf(call({ documentIds: [DOCUMENT_ID, DOCUMENT_ID], occurrenceTypeId: TYPE_ID })),
    ).toBe(400)
    expect(
      await statusOf(
        call({ documentIds: [DOCUMENT_ID], occurrenceTypeId: TYPE_ID, productCode: 'X' }),
      ),
    ).toBe(400)
    expect(
      await statusOf(call({ documentIds: [DOCUMENT_ID], occurrenceTypeId: TYPE_ID }, null)),
    ).toBe(400)
  })
})
