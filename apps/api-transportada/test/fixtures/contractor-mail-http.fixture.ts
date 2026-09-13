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
  ContractorMailCheckItem,
  ContractorMailSettingsSummary,
} from '../../src/contractor-mail/application/contractor-mail-settings.use-case'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const SETTINGS_ID = '00000000-0000-4000-8000-0000000000b1'

/** Segredos sintéticos: se algum aparecer em qualquer resposta, o contrato falha. */
export const API_KEY = 'resend-synthetic-api-key-do-not-leak'
export const WEBHOOK_SIGNING_SECRET = 'whsec_synthetic_do_not_leak'

export const SETTINGS_SUMMARY: ContractorMailSettingsSummary = {
  apiKeyConfigured: true,
  id: SETTINGS_ID,
  lastWebhookAt: null,
  replyDomain: 'resposta.fernandes-transportadora.com.br',
  senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
  senderName: 'Fernandes Transportadora',
  status: 'pending',
  version: '1',
  webhookId: '00000000-0000-4000-8000-0000000000b2',
  webhookSecretConfigured: true,
}

export const CHECKS_RESULT: readonly ContractorMailCheckItem[] = [
  { key: 'api_key', reason: 'ok', status: 'ok' },
  { key: 'sender_domain', reason: 'ok', status: 'ok' },
  { key: 'reply_mx', reason: 'ok', status: 'ok' },
  { key: 'webhook_received', reason: 'webhook_never_received', status: 'pending' },
  { key: 'test_sent', reason: 'test_not_sent', status: 'pending' },
  { key: 'test_replied', reason: 'test_not_replied', status: 'pending' },
  { key: 'test_dkim', reason: 'test_not_replied', status: 'pending' },
]

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['settings.manage', 'invoices.read']),
}

export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}

type RouteDependencies = {
  readonly read: {
    execute(input: ExecuteCall): Promise<ContractorMailSettingsSummary | null>
  }
  readonly runChecks: {
    execute(input: ExecuteCall): Promise<readonly ContractorMailCheckItem[]>
  }
  readonly save: {
    execute(input: ExecuteCall): Promise<ContractorMailSettingsSummary>
  }
}

type CreateFixtureParams = {
  readonly checks?: readonly ContractorMailCheckItem[]
  readonly permissions?: CompanyContext['permissions']
  readonly saveError?: Error
  readonly settings?: ContractorMailSettingsSummary | null
}

export async function createContractorMailHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly readCalls: ExecuteCall[]
  readonly runChecksCalls: ExecuteCall[]
  readonly saveCalls: ExecuteCall[]
}> {
  const readCalls: ExecuteCall[] = []
  const runChecksCalls: ExecuteCall[] = []
  const saveCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    read: {
      async execute(input) {
        readCalls.push(structuredClone(input))
        return params.settings === undefined ? SETTINGS_SUMMARY : params.settings
      },
    },
    runChecks: {
      async execute(input) {
        runChecksCalls.push(structuredClone(input))
        return params.checks ?? CHECKS_RESULT
      },
    },
    save: {
      async execute(input) {
        saveCalls.push(structuredClone(input))
        if (params.saveError !== undefined) throw params.saveError
        return SETTINGS_SUMMARY
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'contractor-mail-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    handle: (request) => handleRequest(request, { timeout() {} }),
    readCalls,
    runChecksCalls,
    saveCalls,
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/contractor-mail/presentation/contractor-mail-settings.routes.js'
  )) as {
    createContractorMailSettingsRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createContractorMailSettingsRoutes(input)
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
      subject: 'contractor-mail-http-contract',
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
      authorization: 'Bearer contractor-mail-contract',
      'content-type': 'application/json',
      'idempotency-key': 'contractor-mail-contract-key-0001',
    },
    method: input.method,
  })
}

export function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer contractor-mail-contract' },
  })
}
