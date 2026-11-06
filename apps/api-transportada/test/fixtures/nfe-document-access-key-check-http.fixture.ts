/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { defineRoute } from '../../src/http/router.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { createNfeDocumentAccessKeyCheckRoutes } from '../../src/nfe-documents/presentation/nfe-document-access-key-checks.routes'
import { createNfeDocumentRoutes } from '../../src/nfe-documents/presentation/nfe-documents.routes'
import { FRONTEND_ORIGIN } from './fleet-http-payload.fixture'
import { COMPANY_CONTEXT, CORRELATION_ID } from './nfe-access-key-lookup.fixture'
import { authenticatedContext, createTestRouter } from './nfe-access-key-lookup-http.fixture'

type ExecuteCall = Record<string, unknown>

type CreateFixtureParams = {
  readonly checkResult?: unknown | Error
  readonly permissions?: CompanyContext['permissions']
}

/** Monta junto as rotas de `/nfe-documents/:id`, para provar que a rota fixa não é lida como id. */
export function createNfeDocumentAccessKeyCheckHttpFixture(params: CreateFixtureParams = {}) {
  const checkCalls: ExecuteCall[] = []
  const getDocumentCalls: ExecuteCall[] = []
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected call')
  }
  const routes: readonly ReturnType<typeof defineRoute>[] = [
    ...createNfeDocumentAccessKeyCheckRoutes({
      checkAccessKeys: {
        async execute(input) {
          checkCalls.push(structuredClone(input))
          if (params.checkResult instanceof Error) throw params.checkResult
          return params.checkResult as never
        },
      },
    }),
    ...createNfeDocumentRoutes({
      downloadDocumentXml: { execute: unexpected },
      getDocument: {
        async execute(input) {
          getDocumentCalls.push(structuredClone(input))
          throw new Error('Unexpected getDocument')
        },
      },
      listDocumentEvents: { execute: unexpected },
      listDocuments: { execute: unexpected },
      locateTripByAccessKey: { execute: unexpected },
    }),
  ]
  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    checkCalls,
    getDocumentCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    routes,
  }
}
