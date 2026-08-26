/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'
import type {
  NfseEmissionProfileDetail,
  NfseEmissionProfileOption,
  NfseEmissionProfilePage,
  NfseProviderCredentialSummary,
} from '../../src/nfse-profiles/application/nfse-profile.port'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const PROFILE_ID = '00000000-0000-4000-8000-0000000000a1'
export const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000a2'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-0000000000a3'

/** Segredo sintético: se ele aparecer em qualquer resposta, o contrato falha. */
export const API_TOKEN = 'notarp-synthetic-token-do-not-leak'

export const PROFILE_SETTINGS = {
  chargeComponentLabel: 'Frete',
  cnaeCode: '4930202',
  descriptionMaxLength: '2000',
  descriptionTemplate: 'Transporte rodoviário de cargas referente às notas {{notas}}.',
  freightRuleId: FREIGHT_RULE_ID,
  issExigibility: '1',
  issRate: '0.050000',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '3543402',
  municipalityName: 'Ribeirão Preto',
  name: 'Ribeirão Preto — transporte',
  nbsCode: '',
  observations: '',
  serviceListItem: '16.01',
  taker: '3',
} as const

export const PROFILE_DETAIL = {
  ...PROFILE_SETTINGS,
  companyId: NFE_COMPANY_CONTEXT.companyId,
  createdAt: '2026-08-11T12:00:00.000Z',
  id: PROFILE_ID,
  status: 'draft',
  updatedAt: '2026-08-11T12:00:00.000Z',
  version: '1',
} as const

export const PROFILES_PAGE = {
  items: [PROFILE_DETAIL],
  nextCursor: null,
} as const

/**
 * A opção leva só o que o diálogo de emissão precisa escolher e escrever. Alíquota, CNAE, item da
 * lista e tomador ficam de fora: quem emite não administra parâmetro fiscal.
 */
export const PROFILE_OPTION = {
  descriptionTemplate: PROFILE_SETTINGS.descriptionTemplate,
  id: PROFILE_ID,
  name: PROFILE_SETTINGS.name,
} as const

export const CREDENTIAL_SUMMARY = {
  apiTokenConfigured: true,
  callbackTokenConfigured: true,
  createdAt: '2026-08-11T12:00:00.000Z',
  fiscalEnvironment: 'homologation',
  id: CREDENTIAL_ID,
  municipalRegistration: '123456',
  provider: 'notarp',
  status: 'active',
  taxId: '12345678000199',
  updatedAt: '2026-08-11T12:00:00.000Z',
  version: '1',
} as const

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['settings.manage', 'invoices.read']),
}

export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read', 'nfse.read']),
}

/** O papel `fiscal`: emite nota, não administra configuração da empresa. */
export const ISSUE_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['nfse.issue', 'nfse.read']),
}

type ProfileRouteDependencies = {
  readonly activateProfile: { execute(input: ExecuteCall): Promise<NfseEmissionProfileDetail> }
  readonly createProfile: { execute(input: ExecuteCall): Promise<NfseEmissionProfileDetail> }
  readonly deactivateProfile: { execute(input: ExecuteCall): Promise<NfseEmissionProfileDetail> }
  readonly listProfileOptions: {
    execute(input: ExecuteCall): Promise<readonly NfseEmissionProfileOption[]>
  }
  readonly listProfiles: { execute(input: ExecuteCall): Promise<NfseEmissionProfilePage> }
  readonly updateProfile: { execute(input: ExecuteCall): Promise<NfseEmissionProfileDetail> }
}

type CredentialRouteDependencies = {
  readonly readCredential: {
    execute(input: ExecuteCall): Promise<NfseProviderCredentialSummary | null>
  }
  readonly saveCredential: { execute(input: ExecuteCall): Promise<NfseProviderCredentialSummary> }
}

type CreateFixtureParams = {
  readonly credential?: typeof CREDENTIAL_SUMMARY | null
  readonly createError?: Error
  readonly permissions?: CompanyContext['permissions']
}

export async function createNfseProfilesHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly activateCalls: ExecuteCall[]
  readonly createCalls: ExecuteCall[]
  readonly deactivateCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: ExecuteCall[]
  readonly listOptionsCalls: ExecuteCall[]
  readonly readCredentialCalls: ExecuteCall[]
  readonly saveCredentialCalls: ExecuteCall[]
  readonly updateCalls: ExecuteCall[]
}> {
  const activateCalls: ExecuteCall[] = []
  const createCalls: ExecuteCall[] = []
  const deactivateCalls: ExecuteCall[] = []
  const listCalls: ExecuteCall[] = []
  const listOptionsCalls: ExecuteCall[] = []
  const readCredentialCalls: ExecuteCall[] = []
  const saveCredentialCalls: ExecuteCall[] = []
  const updateCalls: ExecuteCall[] = []

  const profileRoutes = await loadProfileRoutes({
    activateProfile: {
      async execute(input) {
        activateCalls.push(structuredClone(input))
        return { ...PROFILE_DETAIL, status: 'active', version: '2' }
      },
    },
    createProfile: {
      async execute(input) {
        createCalls.push(structuredClone(input))
        if (params.createError) throw params.createError
        return PROFILE_DETAIL
      },
    },
    deactivateProfile: {
      async execute(input) {
        deactivateCalls.push(structuredClone(input))
        return { ...PROFILE_DETAIL, status: 'inactive', version: '3' }
      },
    },
    listProfileOptions: {
      async execute(input) {
        listOptionsCalls.push(structuredClone(input))
        return [PROFILE_OPTION]
      },
    },
    listProfiles: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        return PROFILES_PAGE
      },
    },
    updateProfile: {
      async execute(input) {
        updateCalls.push(structuredClone(input))
        return { ...PROFILE_DETAIL, version: '2' }
      },
    },
  })

  const credentialRoutes = await loadCredentialRoutes({
    readCredential: {
      async execute(input) {
        readCredentialCalls.push(structuredClone(input))
        return params.credential === undefined ? CREDENTIAL_SUMMARY : params.credential
      },
    },
    saveCredential: {
      async execute(input) {
        saveCredentialCalls.push(structuredClone(input))
        return CREDENTIAL_SUMMARY
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes: [...profileRoutes, ...credentialRoutes],
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'nfse-profiles-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    activateCalls,
    createCalls,
    deactivateCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    listOptionsCalls,
    readCredentialCalls,
    saveCredentialCalls,
    updateCalls,
  }
}

async function loadProfileRoutes(
  input: ProfileRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/nfse-profiles/presentation/nfse-emission-profiles.routes.js'
  )) as {
    createNfseEmissionProfileRoutes(
      dependencies: ProfileRouteDependencies,
    ): readonly RegisteredRoute[]
  }
  return module.createNfseEmissionProfileRoutes(input)
}

async function loadCredentialRoutes(
  input: CredentialRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/nfse-profiles/presentation/nfse-provider-credentials.routes.js'
  )) as {
    createNfseProviderCredentialRoutes(
      dependencies: CredentialRouteDependencies,
    ): readonly RegisteredRoute[]
  }
  return module.createNfseProviderCredentialRoutes(input)
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
      subject: 'nfse-profiles-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}

export function jsonRequest(input: {
  readonly body: unknown
  readonly method: string
  readonly path: string
}): Request {
  return new Request(`http://localhost${input.path}`, {
    body: JSON.stringify(input.body),
    headers: {
      authorization: 'Bearer nfse-profiles-contract',
      'content-type': 'application/json',
      'idempotency-key': 'nfse-profile-contract-key-0001',
    },
    method: input.method,
  })
}

export function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer nfse-profiles-contract' },
  })
}
