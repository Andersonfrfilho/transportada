/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3: as duas rotas da ocorrência do escritório — a lista de tipos de rua (L2) e o lote
 * (D7). A prova aqui é a fiação: política, corpo validado na borda, alvo resolvido pela empresa do
 * contexto, `audit_logs` com as notas do lote e o envelope de resposta.
 */
import { describe, expect, it } from 'bun:test'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import {
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
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

/**
 * Spec 156 T7b: a rota do lote virou multipart (o `file` opcional é a foto, D7 §3.5/D9). Um campo
 * `documentIds` por nota — é assim que um array chega numa `FormData`.
 */
function multipartRequest(input: {
  readonly fields?: Record<string, readonly string[] | string>
  readonly file?: { readonly bytes: Uint8Array; readonly mimeType: string }
  readonly idempotencyKey?: string
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item)
    } else {
      form.set(key, value as string)
    }
  }
  if (input.file !== undefined) {
    form.set('file', new File([input.file.bytes], 'foto.jpg', { type: input.file.mimeType }))
  }
  const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.7' }
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x/documents/field-occurrences', {
    body: form,
    headers,
    method: 'POST',
  })
}

function buildDependencies() {
  const registered: unknown[] = []
  const dependencies: TripFieldOfficeOccurrenceDependencies = {
    listFieldOccurrenceTypes: async () => [
      { attachmentMode: 'off', id: TYPE_ID, name: 'Cliente ausente' },
    ],
    registerOccurrences: async (input) => {
      registered.push(input)
      return {
        items: input.documentIds.map((documentId) => ({ documentId, id: `occ-${documentId}` })),
      }
    },
    resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
    targets: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus: 'on_delivery_route',
      }),
    },
  }
  return { dependencies, registered }
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

  it('GET devolve id, nome e attachmentMode dos tipos de rua', async () => {
    const response = await findRoute('GET').execute({
      context: context(),
      correlationId: 'c-1',
      pathParameters: {},
      request: new Request('http://localhost/trips/occurrence-types/field'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [{ attachmentMode: 'off', id: TYPE_ID, name: 'Cliente ausente' }],
    })
  })

  it('POST resolve o alvo, registra o lote e pede a trilha ao caso de uso', async () => {
    const { dependencies, registered } = buildDependencies()
    const route = createTripFieldOfficeOccurrenceRoutes(dependencies).find(
      (candidate) => candidate.method === 'POST',
    )

    const response = await route!.execute({
      context: context(),
      correlationId: 'c-2',
      pathParameters: { id: TRIP_ID },
      request: multipartRequest({
        fields: { documentIds: [DOCUMENT_ID], note: ' Portão fechado ', occurrenceTypeId: TYPE_ID },
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
      attachment: null,
      companyId: COMPANY_ID,
      documentIds: [DOCUMENT_ID],
      idempotencyKey: 'lote-1',
      note: 'Portão fechado',
      occurrenceTypeId: TYPE_ID,
      officeAudit: {
        action: 'trip_field_office.document_occurrences',
        correlationId: 'c-2',
        ipAddress: expect.any(String),
      },
      target: { onBehalfOfDriverId: DRIVER_ID, tripId: TRIP_ID },
    })
  })

  it('POST valida o corpo na borda: vazio, mais de 50, repetido, campo a mais e sem chave → 400', async () => {
    const route = findRoute('POST')
    const call = (
      fields: Record<string, readonly string[] | string>,
      idempotencyKey: string | null = 'lote-1',
    ) =>
      route.execute({
        context: context(),
        correlationId: 'c-3',
        pathParameters: { id: TRIP_ID },
        request: multipartRequest(
          idempotencyKey === null ? { fields } : { fields, idempotencyKey },
        ),
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

  it('POST T7b: o `file` opcional vira o anexo do lote, e sem ele o anexo é null', async () => {
    const { dependencies, registered } = buildDependencies()
    const route = createTripFieldOfficeOccurrenceRoutes(dependencies).find(
      (candidate) => candidate.method === 'POST',
    )
    const bytes = new Uint8Array([1, 2, 3])

    const response = await route!.execute({
      context: context(),
      correlationId: 'c-4',
      pathParameters: { id: TRIP_ID },
      request: multipartRequest({
        fields: { documentIds: [DOCUMENT_ID], occurrenceTypeId: TYPE_ID },
        file: { bytes, mimeType: 'image/jpeg' },
        idempotencyKey: 'lote-foto',
      }),
    })

    expect(response.status).toBe(201)
    expect(registered[0]).toMatchObject({ attachment: { mimeType: 'image/jpeg' } })
    expect((registered[0] as { attachment: { bytes: Uint8Array } }).attachment.bytes).toEqual(bytes)
  })
})
