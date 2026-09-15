/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { stubUserPictureExistence } from './user-picture-existence.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  AddressCorrectionRequest,
  AddressFields,
} from '../../src/address-correction/application/address-correction.port.js'
import type {
  SaveAddressCorrectionDraftInput,
  SaveAddressCorrectionDraftUseCase,
} from '../../src/address-correction/application/save-address-correction-draft.use-case.js'
import type { ListAddressCorrectionRequestsUseCase } from '../../src/address-correction/application/list-address-correction-requests.use-case.js'
import { COMPANY_CONTEXT } from './fleet-http.fixture'
import { CORRELATION_ID, FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

export const SETTINGS_MANAGE_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'settings.manage',
])

export const PROPOSED_ADDRESS: AddressFields = {
  city: 'São Paulo',
  cityCode: '3550308',
  complement: 'Fundos',
  district: 'Bela Vista',
  number: '45',
  postalCode: '01310100',
  state: 'SP',
  street: 'Avenida Paulista',
}

export const ADDRESS_CORRECTION_REQUEST: AddressCorrectionRequest = {
  actorUserId: COMPANY_CONTEXT.userId,
  addressKey: '3550308|01310100|45',
  companyId: COMPANY_CONTEXT.companyId,
  contractorId: '00000000-0000-4000-8000-000000000a01',
  createdAt: new Date('2026-09-15T12:00:00.000Z'),
  id: '00000000-0000-4000-8000-000000000a10',
  proposed: PROPOSED_ADDRESS,
  reasonDistanceMetres: '820.00',
  reasonMatchLevel: 'street',
  recipientName: null,
  reported: {
    city: 'São Paulo',
    cityCode: '3550308',
    complement: null,
    district: 'Bela Vista',
    number: '45',
    postalCode: '01310100',
    state: 'SP',
    street: 'Av Paulista',
  },
  sentAt: null,
  status: 'draft',
  threadId: null,
  updatedAt: new Date('2026-09-15T12:00:00.000Z'),
}

type CreateFixtureParams = {
  readonly listResult?: readonly AddressCorrectionRequest[]
  readonly permissions?: CompanyContext['permissions']
  readonly saveError?: Error
  readonly saveResult?: AddressCorrectionRequest
}

export async function createAddressCorrectionHttpFixture(
  params: CreateFixtureParams = {},
): Promise<{
  readonly companyId: string
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: { readonly companyId: string }[]
  readonly saveCalls: SaveAddressCorrectionDraftInput[]
}> {
  const listCalls: { readonly companyId: string }[] = []
  const saveCalls: SaveAddressCorrectionDraftInput[] = []

  const listRequests: ListAddressCorrectionRequestsUseCase = {
    list: async (input) => {
      listCalls.push(structuredClone(input))
      return params.listResult ?? [ADDRESS_CORRECTION_REQUEST]
    },
  }

  const saveDraft: SaveAddressCorrectionDraftUseCase = {
    save: async (input) => {
      saveCalls.push(structuredClone(input))
      if (params.saveError !== undefined) throw params.saveError
      return params.saveResult ?? ADDRESS_CORRECTION_REQUEST
    },
  }

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? SETTINGS_MANAGE_PERMISSIONS),
    routes: await loadRoutes({ listRequests, saveDraft }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    companyId: COMPANY_CONTEXT.companyId,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    saveCalls,
  }
}

async function loadRoutes(input: {
  readonly listRequests: ListAddressCorrectionRequestsUseCase
  readonly saveDraft: SaveAddressCorrectionDraftUseCase
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/address-correction/presentation/address-correction.routes.js'
  )) as {
    createAddressCorrectionRoutes(dependencies: {
      readonly listRequests: ListAddressCorrectionRequestsUseCase
      readonly saveDraft: SaveAddressCorrectionDraftUseCase
    }): readonly RegisteredRoute[]
  }
  return module.createAddressCorrectionRoutes(input)
}

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        authorization.authorize(value, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        return input.context
      },
    },
  })
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'address-correction-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
