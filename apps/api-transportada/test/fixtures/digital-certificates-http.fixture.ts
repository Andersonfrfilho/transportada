/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { HTTP_ERROR } from '../../src/shared/api.constant'
import { COMPANY_CONTEXT } from './company-settings-application.fixture'
import { authenticatedContext, healthService } from './digital-certificates-http-auth.fixture'
import {
  ACTIVE_CERTIFICATE,
  NEXT_CURSOR,
  RETIRED_CERTIFICATE,
} from './digital-certificates-http-payload.fixture'
import { FRONTEND_ORIGIN } from './digital-certificates-http-request.fixture'
import type {
  ListCertificatesCall,
  ListCertificatesResult,
  ReplaceCertificateCall,
  RouteDependencies,
} from './digital-certificates-http.types'

export {
  DIGITAL_CERTIFICATES_PATH,
  FRONTEND_ORIGIN,
  certificateGetRequest,
  certificatePostRequest,
  multipartBytes,
  rawMultipartRequest,
  responseApiError,
  validMultipartParts,
} from './digital-certificates-http-request.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly listError?: Error
  readonly listResult?: ListCertificatesResult
  readonly permissions?: CompanyContext['permissions']
  readonly replaceError?: Error
}

export async function createDigitalCertificatesHttpFixture(
  params: CreateFixtureParams = {},
): Promise<{
  readonly events: string[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: ListCertificatesCall[]
  readonly logs: Array<Record<string, unknown>>
  readonly replaceCalls: ReplaceCertificateCall[]
}> {
  const events: string[] = []
  const listCalls: ListCertificatesCall[] = []
  const logs: Array<Record<string, unknown>> = []
  const replaceCalls: ReplaceCertificateCall[] = []
  const routes = await loadRoutes({
    listCertificates: listSpy({
      calls: listCalls,
      error: params.listError,
      result: params.listResult,
    }),
    replaceCertificate: replaceSpy({ calls: replaceCalls, error: params.replaceError }),
    retireCertificate: { execute: async () => null },
  })
  const router = createTestRouter({
    authenticationError: params.authenticationError,
    events,
    permissions: params.permissions ?? COMPANY_CONTEXT.permissions,
    routes,
  })
  const handleRequest = createHandler({ logs, router })
  return {
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    logs,
    replaceCalls,
  }
}

function createHandler(input: {
  readonly logs: Array<Record<string, unknown>>
  readonly router: ReturnType<typeof createTestRouter>
}) {
  return createRequestHandler({
    createCorrelationId: () => 'certificate-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: {
      error(message, metadata) {
        input.logs.push({ level: 'error', message, ...metadata })
      },
      info(_message, metadata) {
        input.logs.push({ level: 'info', message: _message, ...metadata })
      },
      warn(message, metadata) {
        input.logs.push({ level: 'warn', message, ...metadata })
      },
    },
    requestTimeoutSeconds: 10,
    router: input.router,
  })
}

function createTestRouter(input: {
  readonly authenticationError: Error | undefined
  readonly events: string[]
  readonly permissions: CompanyContext['permissions']
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  const context = authenticatedContext(input.permissions)
  return createRouter({
    authentication: {
      async authenticate() {
        input.events.push('authenticate')
        if (input.authenticationError) throw input.authenticationError
        return context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        input.events.push('authorize')
        authorization.authorize(value, policy)
      },
    },
    healthService: healthService(),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        input.events.push('tenant')
        return context
      },
    },
  })
}

function listSpy(input: {
  readonly calls: ListCertificatesCall[]
  readonly error: Error | undefined
  readonly result: ListCertificatesResult | undefined
}): RouteDependencies['listCertificates'] {
  return {
    async execute(call) {
      input.calls.push(call)
      if (input.error) throw input.error
      return (
        input.result ?? {
          items: [ACTIVE_CERTIFICATE, RETIRED_CERTIFICATE],
          nextCursor: NEXT_CURSOR,
        }
      )
    },
  }
}

function replaceSpy(input: {
  readonly calls: ReplaceCertificateCall[]
  readonly error: Error | undefined
}): RouteDependencies['replaceCertificate'] {
  return {
    async execute(call) {
      const replayed = input.calls.length > 0
      input.calls.push({
        ...call,
        certificate: Uint8Array.from(call.certificate),
        password: Uint8Array.from(call.password),
      })
      if (input.error) throw input.error
      return { certificate: ACTIVE_CERTIFICATE, replayed }
    },
  }
}

async function loadRoutes(dependencies: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/companies/presentation/digital-certificates.routes.js'
  )) as {
    createDigitalCertificateRoutes(input: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createDigitalCertificateRoutes(dependencies)
}

export function unauthenticatedError(): ApiError {
  return new ApiError(HTTP_ERROR.unauthenticated)
}
