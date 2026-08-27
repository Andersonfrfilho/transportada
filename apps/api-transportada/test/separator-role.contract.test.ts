/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createBillingRoutes } from '../src/billing/presentation/billing.routes'
import { createCteIssuanceRoutes } from '../src/cte-issuance/presentation/cte-issuance.routes'
import { createFleetRoutes } from '../src/fleet/presentation/fleet.routes'
import { AuthorizationService } from '../src/identity/application/authorization.service'
import { resolveCompanyPermissions } from '../src/identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../src/identity/domain/tenant-context'
import { createNfeDocumentRoutes } from '../src/nfe-documents/presentation/nfe-documents.routes'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'

/**
 * A rota é montada com dependência falsa só para ler a política dela: o `separator` recusado numa
 * lista de nomes de permissão não prova nada — o que decide o `403` é o par rota→política.
 */
function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

function companyContext(roles: CompanyContext['roles']): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'separator',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: MEMBERSHIP_ID,
      permissions: resolveCompanyPermissions(roles),
      roles,
      userId: USER_ID,
    },
  }
}

function reachableRoutes(roles: CompanyContext['roles']): readonly string[] {
  const service = new AuthorizationService()
  const context = companyContext(roles)
  const dependencies = unusedDependencies() as never
  const routes = [
    ...createTripRoutes(dependencies),
    ...createFleetRoutes(dependencies),
    ...createBillingRoutes(dependencies),
    ...createCteIssuanceRoutes(dependencies),
    ...createNfeDocumentRoutes(dependencies),
  ]

  return routes
    .filter((route) => {
      try {
        service.authorize(context, route.policy)
        return true
      } catch {
        return false
      }
    })
    .map((route) => `${route.method} ${route.pathname}`)
    .sort()
}

describe('separator role contract', () => {
  // A lista é exaustiva de propósito: rota nova de frota, faturamento ou CT-e reprova aqui até
  // alguém decidir, por escrito, se o separador a alcança.
  test('reaches the trip write routes and nothing that changes fleet, billing or CT-e', () => {
    // spec 056 T012: as rotas de estado (separate/load/return/batch-status/plan-route/dispatch/
    // cancel) e a leitura de paradas entram sob a mesma trip.manage/fleet.read que já valiam; o
    // separador ganha acesso a elas de graça, sem mudar nenhuma outra permissão.
    expect(reachableRoutes(['separator'])).toEqual([
      'DELETE /trips/:id/documents/:documentId',
      'GET /fleet/capabilities',
      'GET /fleet/drivers',
      'GET /fleet/drivers/:id/vehicles',
      'GET /fleet/vehicles',
      'GET /nfe-documents',
      'GET /nfe-documents/:id',
      'GET /nfe-documents/:id/eligibility',
      'GET /nfe-documents/:id/xml',
      'GET /nfe-documents/by-access-key/:accessKey/trip-location',
      'GET /trip-documents/returned-with-active-cte',
      'GET /trips',
      'GET /trips/:id',
      'GET /trips/:id/documents/:documentId/delivery-address-history',
      // Spec 059: a prontidão fiscal é leitura da viagem, e o separador a lê como o resto dela
      'GET /trips/:id/fiscal-readiness',
      /**
       * Spec 060 D3: o agendamento **é** do separador, e é decisão registrada aqui. Ele monta a
       * viagem, e o portão do despacho que a pendência de agendamento levanta é dele para limpar —
       * mandar isso para outra pessoa deixaria o caminhão parado esperando quem não está no galpão.
       * O que ele continua não fazendo é emitir documento fiscal e reportar entrega.
       */
      'GET /trips/:id/schedules',
      'GET /trips/:id/stops',
      'PATCH /trips/:id/stops/order',
      'POST /trips',
      'POST /trips/:id/cancel',
      'POST /trips/:id/close',
      /**
       * Spec 061: pedágio e avulso são lançamento de **operação**, não de dinheiro sensível — quem
       * monta a viagem lança, e o resultado (que mostra margem e o que se paga ao agregado) continua
       * fora do alcance dele.
       */
      'POST /trips/:id/costs',
      'POST /trips/:id/dispatch',
      'POST /trips/:id/documents',
      'POST /trips/:id/documents/:documentId/deliver',
      'POST /trips/:id/documents/:documentId/delivery-address',
      'POST /trips/:id/documents/:documentId/load',
      'POST /trips/:id/documents/:documentId/return',
      'POST /trips/:id/documents/:documentId/separate',
      'POST /trips/:id/documents/batch-status',
      'POST /trips/:id/plan-route',
      'POST /trips/:id/stops/:stopId/schedule',
    ])
  })

  test('is refused by every write route of fleet, billing and CT-e', () => {
    const reachable = new Set(reachableRoutes(['separator']))

    for (const route of [
      'POST /fleet/vehicles',
      'PATCH /fleet/vehicles/:id',
      'POST /fleet/drivers',
      'PATCH /fleet/drivers/:id',
      'PUT /fleet/drivers/:id/vehicles',
      'GET /fleet/drivers/availability',
      'GET /billing/eligible-ctes',
      'GET /billing/invoices',
      'POST /billing/invoices',
      'PATCH /billing/invoices/:id',
      'POST /billing/invoices/:id/cancel',
      'POST /cte-batches/:id/issue',
      'POST /cte-batches/:id/items/:itemId/cancel',
      'POST /cte-batches/items/export',
    ]) {
      expect(reachable.has(route)).toBe(false)
    }
  })

  // O separador monta a viagem; o MDF-e é documento fiscal e continua com quem responde por ele.
  test('does not reach the fiscal manifest of the trip it assembles', () => {
    expect(reachableRoutes(['separator'])).not.toContain('POST /trips/:id/mdfe-manifests')
  })
})
