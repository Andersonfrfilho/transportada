/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3: `GET /trips/:id/field-delivery-documents` devolve a chave de acesso de
 * cada nota da viagem para o assistente de OCR do canhoto casar pela chave inteira (pendência da
 * T13, `b1653f25`) — sem tocar em `GET /trips/:id` (ressalva M1 do t7-design.md).
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripFieldDeliveryDocumentsRoutes } from '../../src/trips/presentation/trip-field-delivery-documents.routes.js'
import { readFieldDeliveryDocuments } from '../../src/trips/application/read-field-delivery-documents.use-case.js'
import { TripNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000010'

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

describe('readFieldDeliveryDocuments (spec 156 T14, ADR-0069 §3)', () => {
  it('devolve a lista quando a viagem é da empresa', async () => {
    const documents = [
      {
        accessKey: '1'.repeat(44),
        id: 'doc-1',
        nfeNumber: '123',
        nfeSeries: '1',
        releasedAt: null,
      },
    ]
    const result = await readFieldDeliveryDocuments({
      companyId: COMPANY_ID,
      repository: { readTripFieldDeliveryDocuments: async () => documents },
      tripId: TRIP_ID,
    })

    expect(result).toEqual(documents)
  })

  it('lança TripNotFoundError quando a viagem não é desta empresa', async () => {
    await expect(
      readFieldDeliveryDocuments({
        companyId: COMPANY_ID,
        repository: { readTripFieldDeliveryDocuments: async () => null },
        tripId: TRIP_ID,
      }),
    ).rejects.toBeInstanceOf(TripNotFoundError)
  })
})

describe('GET /trips/:id/field-delivery-documents (spec 156 T14)', () => {
  it('é rota própria, GET, com trip.report-on-behalf — não mexe em GET /trips/:id (M1)', () => {
    const routes = createTripFieldDeliveryDocumentsRoutes({
      readFieldDeliveryDocuments: async () => [],
    })

    expect(routes).toHaveLength(1)
    expect(routes[0]!.method).toBe('GET')
    expect(routes[0]!.pathname).toBe('/trips/:id/field-delivery-documents')
    expect(routes[0]!.policy).toEqual({ permission: 'trip.report-on-behalf', scope: 'company' })
  })

  it('devolve accessKey, número, série e releasedAt de cada nota, sem cache', async () => {
    const calls: unknown[] = []
    const [route] = createTripFieldDeliveryDocumentsRoutes({
      readFieldDeliveryDocuments: async (input) => {
        calls.push(input)
        return [
          {
            accessKey: '1'.repeat(44),
            id: 'doc-1',
            nfeNumber: '123',
            nfeSeries: '1',
            releasedAt: null,
          },
          {
            accessKey: null,
            id: 'doc-2',
            nfeNumber: '456',
            nfeSeries: '1',
            releasedAt: '2026-09-18T00:00:00.000Z',
          },
        ]
      },
    })
    if (route === undefined) throw new Error('ROUTE_NOT_FOUND')

    const response = await route.execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: { id: TRIP_ID },
      request: new Request(`http://localhost/trips/${TRIP_ID}/field-delivery-documents`),
    })

    expect(calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: {
        documents: [
          {
            accessKey: '1'.repeat(44),
            id: 'doc-1',
            nfeNumber: '123',
            nfeSeries: '1',
            releasedAt: null,
          },
          {
            accessKey: null,
            id: 'doc-2',
            nfeNumber: '456',
            nfeSeries: '1',
            releasedAt: '2026-09-18T00:00:00.000Z',
          },
        ],
      },
    })
  })

  it('o separador e o motorista não alcançam; company-admin, operator e finance alcançam', () => {
    const [route] = createTripFieldDeliveryDocumentsRoutes({
      readFieldDeliveryDocuments: async () => [],
    })
    if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
    const permission = route.policy?.permission as never

    expect(resolveCompanyPermissions(['separator']).has(permission)).toBe(false)
    expect(resolveCompanyPermissions(['driver']).has(permission)).toBe(false)
    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      expect(resolveCompanyPermissions([role]).has(permission)).toBe(true)
    }
  })
})
