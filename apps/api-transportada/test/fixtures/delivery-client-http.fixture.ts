/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { defineRoute } from '../../src/http/router.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  DeliveryClient,
  DeliveryClientDetail,
} from '../../src/delivery-clients/application/delivery-client.port'
import { createDeliveryClientRoutes } from '../../src/delivery-clients/presentation/delivery-client.routes'

import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
} from './freight-region-http.fixture'

type ExecuteCall = Record<string, unknown>
type RegisteredRoute = ReturnType<typeof defineRoute>

export const DELIVERY_CLIENTS_PATH = '/delivery-clients'
export const CLIENT_ID = '00000000-0000-4000-8000-000000000601'
export const CLIENT_TAX_ID = '12345678000190'

export const CLIENT: DeliveryClient = {
  defaultServiceTimeMinutes: 20,
  deliveryFeeAmount: '45.0000',
  displayName: 'Loja Central',
  id: CLIENT_ID,
  notes: '',
  requiresScheduling: true,
  status: 'active',
  taxId: CLIENT_TAX_ID,
}

export const CLIENT_DETAIL: DeliveryClientDetail = {
  ...CLIENT,
  exceptions: [{ closesAt: null, exceptionOn: '2026-12-24', kind: 'closed', opensAt: null }],
  windows: [{ closesAt: '11:00:00', opensAt: '08:00:00', weekday: 4 }],
}

/** Quem cuida da frota lê o cadastro; escrever regra de entrega é a mesma permissão de cadastro. */
export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

export type DeliveryClientFixture = {
  readonly calls: Readonly<Record<string, ExecuteCall[]>>
  readonly handle: (request: Request) => Promise<Response>
}

export function createDeliveryClientHttpFixture(
  params: { readonly error?: Error; readonly permissions?: CompanyContext['permissions'] } = {},
): DeliveryClientFixture {
  const calls: Record<string, ExecuteCall[]> = {
    create: [],
    getByTaxId: [],
    getClient: [],
    list: [],
    replaceExceptions: [],
    replaceWindows: [],
    update: [],
  }

  function record<TResult>(name: string, result: TResult) {
    return {
      async execute(input: ExecuteCall) {
        calls[name]?.push(structuredClone(input))
        if (params.error !== undefined) throw params.error
        return result
      },
    }
  }

  const routes: readonly RegisteredRoute[] = createDeliveryClientRoutes({
    createClient: record('create', CLIENT),
    getByTaxId: record('getByTaxId', CLIENT_DETAIL),
    getClient: record('getClient', CLIENT_DETAIL),
    listClients: record('list', { items: [CLIENT], nextCursor: null }),
    replaceExceptions: record('replaceExceptions', CLIENT_DETAIL.exceptions),
    replaceWindows: record('replaceWindows', CLIENT_DETAIL.windows),
    updateClient: record('update', CLIENT),
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
      routes,
    }),
  })

  return { calls, handle: (request) => handleRequest(request, { timeout() {} }) }
}
