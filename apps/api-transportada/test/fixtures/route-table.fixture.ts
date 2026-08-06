/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  defineAnonymousRoute,
  defineRoute,
  type RegisteredAnonymousRoute,
  type RegisteredRouterRoute,
} from '../../src/http/router.service'

export type RouteTableEntry = {
  readonly method: string
  readonly pathname: string
}

/**
 * Amostra da tabela real cobrindo cada formato de caminho que o roteador reconhece: estático,
 * um parâmetro, dois parâmetros e sub-recurso. Os contratos de CORS derivam daqui em vez de
 * repetir caminho literal — foi lista paralela que deixou módulo inteiro sem preflight.
 */
export const ROUTE_TABLE: readonly RouteTableEntry[] = Object.freeze([
  { method: 'GET', pathname: '/billing/invoices' },
  { method: 'POST', pathname: '/billing/invoices' },
  { method: 'GET', pathname: '/billing/invoices/:id' },
  { method: 'PATCH', pathname: '/billing/invoices/:id' },
  { method: 'POST', pathname: '/billing/invoices/:id/cancel' },
  { method: 'GET', pathname: '/company-settings' },
  { method: 'PATCH', pathname: '/company-settings' },
  { method: 'GET', pathname: '/company-settings/scheduled-distribution' },
  { method: 'PUT', pathname: '/company-settings/scheduled-distribution' },
  { method: 'DELETE', pathname: '/company-settings/scheduled-distribution' },
  { method: 'GET', pathname: '/cte-batches/:id/items/:itemId/documents' },
  { method: 'DELETE', pathname: '/cte-batches/:id/items/:itemId' },
  { method: 'POST', pathname: '/cte-batches/:id/items/:itemId/cancel' },
  { method: 'GET', pathname: '/cte-emission-profiles' },
  { method: 'POST', pathname: '/cte-emission-profiles' },
  { method: 'GET', pathname: '/digital-certificates' },
  { method: 'POST', pathname: '/digital-certificates' },
  { method: 'DELETE', pathname: '/digital-certificates' },
  { method: 'GET', pathname: '/fleet/drivers' },
  { method: 'POST', pathname: '/fleet/drivers' },
  { method: 'GET', pathname: '/fleet/drivers/:driverId' },
  { method: 'PATCH', pathname: '/fleet/drivers/:driverId' },
  { method: 'GET', pathname: '/fleet/drivers/:driverId/vehicles' },
  { method: 'PUT', pathname: '/fleet/drivers/:driverId/vehicles' },
  { method: 'GET', pathname: '/fleet/vehicles' },
  { method: 'POST', pathname: '/fleet/vehicles' },
  { method: 'GET', pathname: '/fleet/vehicles/:vehicleId' },
  { method: 'PATCH', pathname: '/fleet/vehicles/:vehicleId' },
  { method: 'POST', pathname: '/nfe-imports/xml' },
  { method: 'GET', pathname: '/trips' },
  { method: 'POST', pathname: '/trips' },
  { method: 'DELETE', pathname: '/trips/:id/documents/:documentId' },
  { method: 'GET', pathname: '/view-preferences' },
  { method: 'PUT', pathname: '/view-preferences' },
])

export const ANONYMOUS_ROUTE_TABLE: readonly RouteTableEntry[] = Object.freeze([
  { method: 'POST', pathname: '/bootstrap/first-admin' },
])

export function createRouteTableFixture(): readonly RegisteredRouterRoute[] {
  return ROUTE_TABLE.map((entry) =>
    defineRoute({
      async handle() {
        return new Response(null, { status: 204 })
      },
      method: entry.method,
      parse() {
        return undefined
      },
      pathname: entry.pathname,
    }),
  )
}

export function createAnonymousRouteTableFixture(): readonly RegisteredAnonymousRoute[] {
  return ANONYMOUS_ROUTE_TABLE.map((entry) =>
    defineAnonymousRoute({
      async handle() {
        return new Response(null, { status: 204 })
      },
      method: entry.method,
      parse() {
        return undefined
      },
      pathname: entry.pathname,
    }),
  )
}

const IDENTIFIER_SAMPLES: Readonly<Record<string, string>> = Object.freeze({
  documentId: '00000000-0000-4000-8000-000000000004',
  driverId: '00000000-0000-4000-8000-000000000002',
  id: '00000000-0000-4000-8000-000000000001',
  itemId: '00000000-0000-4000-8000-000000000003',
  vehicleId: '00000000-0000-4000-8000-000000000005',
})

/** Troca `:id` por um UUID canônico — o roteador descarta segmento fora do formato. */
export function concreteRoutePathname(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? (IDENTIFIER_SAMPLES[segment.slice(1)] ?? segment) : segment,
    )
    .join('/')
}
