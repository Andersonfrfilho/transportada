/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.4 (D5): `GET /trips/occurrence-types/field` recebe os `documentIds` do lote e os passa
 * ao filtro; sem eles a lista é a de "sem nota". `contractorId` da query segue só para a exceção.
 */
import { describe, expect, it } from 'bun:test'

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
import { createTripFieldOfficeOccurrenceRoutes } from '../../src/trips/presentation/trip-field-office-occurrence.routes.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const FIRST = '00000000-0000-4000-8000-0000000000d1'
const SECOND = '00000000-0000-4000-8000-0000000000d2'

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: resolveCompanyPermissions(['operator']),
      roles: ['operator'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function buildRoute() {
  const calls: { readonly documentIds?: readonly string[] | undefined }[] = []
  const route = createTripFieldOfficeOccurrenceRoutes({
    listFieldOccurrenceTypes: async (input) => {
      calls.push({ documentIds: input.documentIds })
      return []
    },
    registerOccurrences: async () => ({ items: [] }),
    resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
    targets: { findTripCrew: async () => null },
  }).find((candidate) => candidate.method === 'GET')
  if (route === undefined) throw new Error('route missing')
  return { calls, route }
}

function execute(route: ReturnType<typeof buildRoute>['route'], query: string) {
  return route.execute({
    context: context(),
    correlationId: 'c-1',
    pathParameters: {},
    request: new Request(`http://localhost/trips/occurrence-types/field${query}`),
  })
}

describe('a lista de tipos do escritório recebe as notas do lote (spec 270, D5)', () => {
  it('passa os documentIds ao filtro, na ordem pedida', async () => {
    const { calls, route } = buildRoute()

    await execute(route, `?documentIds=${FIRST},${SECOND}`)

    expect(calls).toEqual([{ documentIds: [FIRST, SECOND] }])
  })

  it('sem documentIds, a lista é a de sem nota', async () => {
    const { calls, route } = buildRoute()

    await execute(route, '')

    expect(calls).toEqual([{ documentIds: [] }])
  })

  it('documentIds que não é UUID, ou repetido, é 400 e nada é lido', async () => {
    const { calls, route } = buildRoute()
    const statuses: number[] = []
    for (const query of ['?documentIds=nope', `?documentIds=${FIRST},${FIRST}`]) {
      try {
        statuses.push((await execute(route, query)).status)
      } catch (error) {
        statuses.push(error instanceof ApiError ? error.status : 500)
      }
    }

    expect(statuses).toEqual([400, 400])
    expect(calls).toEqual([])
  })
})
