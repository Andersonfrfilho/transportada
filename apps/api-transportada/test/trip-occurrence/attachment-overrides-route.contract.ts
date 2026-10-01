/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B3: `GET`/`PUT /company-settings/occurrence-types/:occurrenceTypeId/attachment-overrides`
 * — mesmo molde de `deliveryProofOverridesSchema`/`contractor-overrides.contract.ts`: substituição
 * total, 404 fora do tenant, `settings.manage` nas duas rotas.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { OccurrenceTypeNotFoundError } from '../../src/trips/domain/trip.error.js'
import type {
  OccurrenceAttachmentOverridesPort,
  OccurrenceAttachmentOverridesResult,
} from '../../src/trips/application/occurrence-attachment-overrides.use-case.js'
import {
  readOccurrenceAttachmentOverrides,
  replaceOccurrenceAttachmentOverrides,
} from '../../src/trips/application/occurrence-attachment-overrides.use-case.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000010'
const ATTACHMENT_OVERRIDES_PATH = `/company-settings/occurrence-types/:occurrenceTypeId/attachment-overrides`

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
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

function baseTripRouteDependencies(): Dependencies {
  return new Proxy({} as Dependencies, {
    get: () => ({ execute: NOT_CALLED }),
  })
}

function buildPort(
  overrides: Partial<OccurrenceAttachmentOverridesPort> = {},
): OccurrenceAttachmentOverridesPort {
  return {
    findOccurrenceType: async () => ({ id: OCCURRENCE_TYPE_ID }),
    listContractorOverrides: async () => [],
    listRecipientOverrides: async () => [],
    replaceContractorOverrides: async () => {},
    replaceRecipientOverrides: async () => {},
    ...overrides,
  }
}

function routeOf(dependencies: Dependencies, method: string) {
  const route = createTripRoutes(dependencies).find(
    (candidate) => candidate.method === method && candidate.pathname === ATTACHMENT_OVERRIDES_PATH,
  )
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

function putRequest(body: object): Request {
  return new Request(
    `http://localhost/company-settings/occurrence-types/${OCCURRENCE_TYPE_ID}/attachment-overrides`,
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    },
  )
}

describe('rotas de exceção de attachmentMode por tipo de ocorrência (spec 218 RF-B3)', () => {
  it('GET devolve as duas listas de exceção do tipo', async () => {
    const port = buildPort({
      listContractorOverrides: async () => [
        { attachmentMode: 'required', contractorId: CONTRACTOR_ID },
      ],
    })
    const dependencies = {
      ...baseTripRouteDependencies(),
      readOccurrenceAttachmentOverrides: {
        execute: (input: { readonly occurrenceTypeId: string }) =>
          readOccurrenceAttachmentOverrides({ companyId: COMPANY_ID, port, ...input }),
      },
    }

    const response = await routeOf(dependencies, 'GET').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: { occurrenceTypeId: OCCURRENCE_TYPE_ID },
      request: new Request(
        `http://localhost/company-settings/occurrence-types/${OCCURRENCE_TYPE_ID}/attachment-overrides`,
      ),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: OccurrenceAttachmentOverridesResult }
    expect(body.data.contractorOverrides).toEqual([
      { attachmentMode: 'required', contractorId: CONTRACTOR_ID },
    ])
    expect(body.data.recipientOverrides).toEqual([])
  })

  it('GET com tipo fora do tenant responde 404', async () => {
    const port = buildPort({ findOccurrenceType: async () => null })
    const dependencies = {
      ...baseTripRouteDependencies(),
      readOccurrenceAttachmentOverrides: {
        execute: (input: { readonly occurrenceTypeId: string }) =>
          readOccurrenceAttachmentOverrides({ companyId: COMPANY_ID, port, ...input }),
      },
    }

    await expect(
      routeOf(dependencies, 'GET').execute({
        context: context(),
        correlationId: 'correlation-1',
        pathParameters: { occurrenceTypeId: OCCURRENCE_TYPE_ID },
        request: new Request(
          `http://localhost/company-settings/occurrence-types/${OCCURRENCE_TYPE_ID}/attachment-overrides`,
        ),
      }),
    ).rejects.toBeInstanceOf(OccurrenceTypeNotFoundError)
  })

  it('PUT feliz substitui as duas listas e devolve o resultado', async () => {
    const savedContractor: unknown[] = []
    const port = buildPort({
      listContractorOverrides: async () => [
        { attachmentMode: 'required', contractorId: CONTRACTOR_ID },
      ],
      replaceContractorOverrides: async (input) => {
        savedContractor.push(input.overrides)
      },
    })
    const dependencies = {
      ...baseTripRouteDependencies(),
      replaceOccurrenceAttachmentOverrides: {
        execute: (
          input: { readonly occurrenceTypeId: string } & {
            readonly contractorOverrides: readonly {
              readonly attachmentMode: 'required' | 'optional' | 'off'
              readonly contractorId: string
            }[]
            readonly recipientOverrides: readonly {
              readonly attachmentMode: 'required' | 'optional' | 'off'
              readonly taxId: string
            }[]
          },
        ) => replaceOccurrenceAttachmentOverrides({ companyId: COMPANY_ID, port, ...input }),
      },
    }

    const response = await routeOf(dependencies, 'PUT').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: { occurrenceTypeId: OCCURRENCE_TYPE_ID },
      request: putRequest({
        contractorOverrides: [{ attachmentMode: 'required', contractorId: CONTRACTOR_ID }],
        recipientOverrides: [],
      }),
    })

    expect(response.status).toBe(200)
    expect(savedContractor).toEqual([[{ attachmentMode: 'required', contractorId: CONTRACTOR_ID }]])
    const body = (await response.json()) as { data: OccurrenceAttachmentOverridesResult }
    expect(body.data.contractorOverrides).toEqual([
      { attachmentMode: 'required', contractorId: CONTRACTOR_ID },
    ])
  })

  it('as duas rotas exigem settings.manage', () => {
    const dependencies = baseTripRouteDependencies()

    for (const method of ['GET', 'PUT']) {
      expect(routeOf(dependencies, method).policy).toEqual({
        permission: 'settings.manage',
        scope: 'company',
      })
    }
  })
})
