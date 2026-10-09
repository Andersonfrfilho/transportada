/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262: o roteador de verdade (autenticação, política, limitador, `parse` do Zod, tratamento de erro) com as
 * rotas da chave da FeriadosAPI, os casos de uso que o teste escolher e um registro de tudo que foi logado.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { RateLimitWindowStorePort } from '../../src/http/rate-limit-window.port'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import type { HolidayProviderSettingsUseCases } from '../../src/business-calendar/application/holiday-provider-settings.use-case'
import { createHolidayProviderSettingsRoutes } from '../../src/business-calendar/presentation/holiday-provider-settings.routes'
import { createTestRouter } from './contractor-mail-http.fixture'

export const PROVIDER_SETTINGS_PATH = '/holiday-imports/provider-settings'
export const PROVIDER_TOKEN_PATH = '/holiday-imports/provider-settings/token'
export const CLIENT_IP = '203.0.113.9'

/** Chave sintética e obviamente falsa: se aparecer em qualquer saída, o teste falha. */
export const SENTINEL_TOKEN = 'FAKE-feriadosapi-key-do-not-leak-0042'

export const CONFIGURE_PERMISSIONS = ['holiday-import.configure', 'settings.manage'] as const

export type HolidayProviderSettingsHttpFixture = {
  readonly handle: (request: Request) => Promise<Response>
  readonly logs: string[]
}

export function createHolidayProviderSettingsHttpFixture(input: {
  readonly companyId: string
  readonly permissions: readonly string[]
  readonly rateLimitWindows?: RateLimitWindowStorePort
  readonly useCases: HolidayProviderSettingsUseCases
  readonly userId: string
}): HolidayProviderSettingsHttpFixture {
  const { useCases, ...rest } = input
  return createRoutesHttpFixture({
    ...rest,
    routes: createHolidayProviderSettingsRoutes({ ...useCases, resolveClientIp: () => CLIENT_IP }),
  })
}

/** O roteador de verdade com quaisquer rotas do calendário, para os contratos do liga/desliga também. */
export function createRoutesHttpFixture(input: {
  readonly companyId: string
  readonly permissions: readonly string[]
  readonly rateLimitWindows?: RateLimitWindowStorePort
  readonly routes: Parameters<typeof createTestRouter>[0]['routes']
  readonly userId: string
}): HolidayProviderSettingsHttpFixture {
  const logs: string[] = []
  const router = createTestRouter({
    context: authenticatedContext(input),
    ...(input.rateLimitWindows === undefined ? {} : { rateLimitWindows: input.rateLimitWindows }),
    routes: input.routes,
  })
  const record = (level: string) => (message: string, metadata?: Record<string, unknown>) => {
    logs.push(`${level} ${message} ${JSON.stringify(metadata ?? {})}`)
  }
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'holiday-provider-settings-correlation',
    frontendOrigins: ['http://localhost:53000'],
    logger: { error: record('error'), info: record('info'), warn: record('warn') },
    requestTimeoutSeconds: 10,
    router,
  })

  return { handle: (request) => handleRequest(request, { timeout() {} }), logs }
}

function authenticatedContext(input: {
  readonly companyId: string
  readonly permissions: readonly string[]
  readonly userId: string
}): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: input.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'holiday-provider-settings-contract',
      userId: input.userId,
    },
    scope: {
      companyId: input.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(input.permissions) as CompanyContext['permissions'],
      roles: ['company-admin'],
      userId: input.userId,
    },
  }
}

export function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer holiday-provider-settings-contract' },
  })
}

export function writeRequest(input: {
  readonly body?: unknown
  readonly method: 'DELETE' | 'PUT'
  readonly path: string
}): Request {
  return new Request(`http://localhost${input.path}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers: {
      authorization: 'Bearer holiday-provider-settings-contract',
      'content-type': 'application/json',
      'idempotency-key': 'holiday-provider-settings-contract-key',
    },
    method: input.method,
  })
}
