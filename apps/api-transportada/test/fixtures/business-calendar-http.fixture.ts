/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { defineRoute } from '../../src/http/router.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
} from './freight-region-http.fixture.js'

export {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  jsonRequest,
  responseApiError,
  responseData,
} from './freight-region-http.fixture.js'

export const RESOLVED_IP = '10.0.0.9'
export const FORGED_IP = '6.6.6.6'
export const RULE_ID = '00000000-0000-4000-8000-000000000a01'
export const HOLIDAY_ID = '00000000-0000-4000-8000-000000000a02'
export const STATE_HOLIDAY_ID = '00000000-0000-4000-8000-000000000a03'
export const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'

/** `settings.manage` é a chave das rotas novas; o separador e o operador de frota não a têm. */
export const MANAGER_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'settings.manage',
])
export const FLEET_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'fleet.manage',
  'trip.manage',
])

/** O dublê registra o que o caso de uso recebeu: é o que prova a empresa, o ator e o IP. */
export type RecordedCalls = Record<string, unknown[]>

export function recordingUseCase<TResult>(
  calls: RecordedCalls,
  name: string,
  result: TResult | ((input: never) => TResult),
): { execute(input: Record<string, unknown>): Promise<TResult> } {
  calls[name] = []
  return {
    async execute(input) {
      calls[name]?.push(structuredClone(input))
      return typeof result === 'function'
        ? (result as (value: never) => TResult)(input as never)
        : result
    },
  }
}

export function createHttpHandler(input: {
  readonly permissions?: CompanyContext['permissions']
  readonly routes: readonly ReturnType<typeof defineRoute>[]
}): (request: Request) => Promise<Response> {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? MANAGER_PERMISSIONS),
      routes: input.routes,
    }),
  })

  return (request) => handleRequest(request, { timeout() {} })
}

/** Cada campo fora do contrato é uma isca: o corpo nunca decide a empresa nem os campos derivados. */
export const FORBIDDEN_BODY_KEYS = [
  { companyId: OTHER_COMPANY_ID },
  { createdAt: '2026-01-01T00:00:00.000Z' },
  { sourceRuleId: RULE_ID },
  { materializedThroughYear: 2099 },
] as const
