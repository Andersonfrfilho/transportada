/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3-api (RF11c): `GET /company-settings/occurrence-types/attachment-overrides` — as exceções
 * de contratante e de destinatário de TODOS os tipos da empresa numa resposta, agrupadas por tipo.
 * O contrato prova o formato, o isolamento por empresa, a política e que o endereço fixo não é lido
 * como `:occurrenceTypeId` pelo roteador real.
 */
import { describe, expect, it } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  listOccurrenceAttachmentOverridesByType,
  type ListOccurrenceAttachmentOverridesPort,
  type ListOccurrenceAttachmentOverridesResult,
} from '../../src/trips/application/list-occurrence-attachment-overrides.use-case.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TYPE_WITH_OVERRIDES = '00000000-0000-4000-8000-0000000000e1'
const TYPE_WITHOUT_OVERRIDES = '00000000-0000-4000-8000-0000000000e2'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000010'
const RECIPIENT_TAX_ID = '12345678000190'
const BATCH_PATH = '/company-settings/occurrence-types/attachment-overrides'
const PER_TYPE_PATH = `/company-settings/occurrence-types/${TYPE_WITH_OVERRIDES}/attachment-overrides`

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000104',
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'batch-overrides-user',
      userId: '00000000-0000-4000-8000-000000000002',
    } as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['settings.manage'] as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

const NOT_CALLED = (): never => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function baseDependencies(): Dependencies {
  return new Proxy({} as Dependencies, { get: () => ({ execute: NOT_CALLED }) })
}

function buildPort(
  overrides: Partial<ListOccurrenceAttachmentOverridesPort> = {},
): ListOccurrenceAttachmentOverridesPort {
  return {
    listOccurrenceTypeIds: async () => [TYPE_WITH_OVERRIDES, TYPE_WITHOUT_OVERRIDES],
    listOverridesForTypes: async () => ({ contractorOverrides: [], recipientOverrides: [] }),
    ...overrides,
  }
}

function dependenciesWith(port: ListOccurrenceAttachmentOverridesPort): Dependencies {
  return {
    ...baseDependencies(),
    listOccurrenceAttachmentOverrides: {
      execute: (input: { readonly context: CompanyContext }) =>
        listOccurrenceAttachmentOverridesByType({ companyId: input.context.companyId, port }),
    },
  }
}

function buildRouter(dependencies: Dependencies) {
  const scope = context()
  return createRouter({
    authentication: { authenticate: async () => scope.identity },
    authorization: {
      authorize: (routed, policy) => new AuthorizationService().authorize(routed, policy),
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    }),
    routes: createTripRoutes(dependencies).filter((route) =>
      route.pathname.startsWith('/company-settings/occurrence-types'),
    ),
    tenantContext: { resolveCompany: async () => scope },
    userPictureExistence: stubUserPictureExistence(),
  })
}

function get(
  pathname: string,
  search = '',
): Parameters<ReturnType<typeof buildRouter>['handle']>[0] {
  return {
    correlationId: 'correlation-1',
    method: 'GET',
    pathname,
    request: new Request(`http://localhost${pathname}${search}`, {
      headers: { authorization: 'Bearer header.payload.signature' },
    }),
  }
}

describe('rota em lote das exceções de exigência por tipo (spec 246 T5.3-api, RF11c)', () => {
  it('devolve todos os tipos agrupados, tipo sem exceção com listas vazias, sem occurrenceTypeId por linha', async () => {
    const calls: unknown[] = []
    const port = buildPort({
      listOverridesForTypes: async (input) => {
        calls.push(input)
        return {
          contractorOverrides: [
            {
              attachmentMode: 'required',
              contractorId: CONTRACTOR_ID,
              itemsMinimumCount: null,
              itemsMode: null,
              noteMode: 'optional',
              occurrenceTypeId: TYPE_WITH_OVERRIDES,
              photoMinimumCount: 2,
              signatureMode: null,
            },
          ],
          recipientOverrides: [
            {
              attachmentMode: 'off',
              itemsMinimumCount: 1,
              itemsMode: 'required',
              noteMode: null,
              occurrenceTypeId: TYPE_WITH_OVERRIDES,
              photoMinimumCount: null,
              signatureMode: 'required',
              taxId: RECIPIENT_TAX_ID,
            },
          ],
        }
      },
    })

    const response = await buildRouter(dependenciesWith(port)).handle(get(BATCH_PATH))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: ListOccurrenceAttachmentOverridesResult }
    expect(body.data).toEqual({
      overridesByType: [
        {
          contractorOverrides: [
            {
              attachmentMode: 'required',
              contractorId: CONTRACTOR_ID,
              itemsMinimumCount: null,
              itemsMode: null,
              noteMode: 'optional',
              photoMinimumCount: 2,
              signatureMode: null,
            },
          ],
          occurrenceTypeId: TYPE_WITH_OVERRIDES,
          recipientOverrides: [
            {
              attachmentMode: 'off',
              itemsMinimumCount: 1,
              itemsMode: 'required',
              noteMode: null,
              photoMinimumCount: null,
              signatureMode: 'required',
              taxId: RECIPIENT_TAX_ID,
            },
          ],
        },
        {
          contractorOverrides: [],
          occurrenceTypeId: TYPE_WITHOUT_OVERRIDES,
          recipientOverrides: [],
        },
      ],
    })
    expect(calls).toEqual([
      { companyId: COMPANY_ID, occurrenceTypeIds: [TYPE_WITH_OVERRIDES, TYPE_WITHOUT_OVERRIDES] },
    ])
  })

  it('o companyId vem do contexto autenticado, nunca da query', async () => {
    const seen: string[] = []
    const port = buildPort({
      listOccurrenceTypeIds: async (input) => {
        seen.push(input.companyId)
        return []
      },
    })
    const forged = '00000000-0000-4000-8000-0000000000ff'

    const response = await buildRouter(dependenciesWith(port)).handle(
      get(BATCH_PATH, `?companyId=${forged}`),
    )

    expect(response.status).toBe(200)
    expect(seen).toEqual([COMPANY_ID])
    expect(await response.json()).toEqual({ data: { overridesByType: [] } })
  })

  it('exige settings.manage', () => {
    const route = createTripRoutes(baseDependencies()).find(
      (candidate) => candidate.method === 'GET' && candidate.pathname === BATCH_PATH,
    )
    expect(route?.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
  })

  it('o endereço fixo não é lido como :occurrenceTypeId, e a rota por tipo segue servindo o seu', async () => {
    const perTypeReads: string[] = []
    const dependencies: Dependencies = {
      ...dependenciesWith(buildPort()),
      readOccurrenceAttachmentOverrides: {
        execute: async (input: { readonly occurrenceTypeId: string }) => {
          perTypeReads.push(input.occurrenceTypeId)
          return { contractorOverrides: [], recipientOverrides: [] }
        },
      },
    }
    const router = buildRouter(dependencies)

    const batch = await router.handle(get(BATCH_PATH))
    expect(batch.status).toBe(200)
    expect(perTypeReads).toEqual([])

    const perType = await router.handle(get(PER_TYPE_PATH))
    expect(perType.status).toBe(200)
    expect(perTypeReads).toEqual([TYPE_WITH_OVERRIDES])
    expect(await perType.json()).toEqual({
      data: { contractorOverrides: [], recipientOverrides: [] },
    })
  })
})
