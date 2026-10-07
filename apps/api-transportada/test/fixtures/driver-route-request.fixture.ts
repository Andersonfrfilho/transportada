/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O pedido ao roteador como o motorista o faz: contexto autenticado de campo e JSON com chave de
 * idempotência. Compartilhado pelos contratos de fronteira do ponto do toque (spec 196 T3.2/T3.4).
 */
import { expect } from 'bun:test'

import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { RegisteredRouterRoute } from '../../src/http/router.service.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'

export function driverContext(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'driver',
      userId: '00000000-0000-4000-8000-000000000001',
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: resolveCompanyPermissions(['driver']),
      roles: ['driver'],
      userId: '00000000-0000-4000-8000-000000000001',
    },
  }
}

export function findRoute(
  routes: readonly RegisteredRouterRoute[],
  pathname: string,
): RegisteredRouterRoute {
  const route = routes.find(
    (candidate) => candidate.method === 'POST' && candidate.pathname === pathname,
  )
  if (route === undefined) throw new Error(`ROUTE_NOT_FOUND:${pathname}`)

  return route
}

export type SendParams = {
  readonly body?: unknown
  readonly pathParameters?: Record<string, string> | undefined
  readonly route: RegisteredRouterRoute
}

export async function send({ body, pathParameters = {}, route }: SendParams): Promise<Response> {
  const headers = new Headers({ 'idempotency-key': 'key-1' })
  if (body !== undefined) headers.set('content-type', 'application/json')

  return route.execute({
    context: driverContext(),
    correlationId: 'correlation-1',
    pathParameters,
    request: new Request(`http://localhost${route.pathname}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers,
      method: 'POST',
    }),
  })
}

export async function expectInvalidRequest(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)

    return error as ApiError
  }

  throw new Error('EXPECTED_400')
}
