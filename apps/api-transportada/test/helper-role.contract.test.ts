/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createBillingRoutes } from '../src/billing/presentation/billing.routes'
import { createCteIssuanceRoutes } from '../src/cte-issuance/presentation/cte-issuance.routes'
import { createCompanyCrewSettingsRoutes } from '../src/fleet/presentation/crew-settings.routes'
import { createFleetRoutes } from '../src/fleet/presentation/fleet.routes'
import { AuthorizationService } from '../src/identity/application/authorization.service'
import { resolveCompanyPermissions } from '../src/identity/domain/authorization.policy'
import type { AuthenticatedContext, CompanyContext } from '../src/identity/domain/tenant-context'
import { createNfeDocumentRoutes } from '../src/nfe-documents/presentation/nfe-documents.routes'
import { createOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/occurrence-conversation.routes'
import { createQuickReplyRoutes } from '../src/occurrence-conversation/presentation/quick-replies.routes'
import { createOccurrenceConversationUnassignedRoutes } from '../src/occurrence-conversation/presentation/occurrence-conversation-unassigned.routes'
import { createPackageBoxMeasurementExportRoutes } from '../src/nfe-documents/presentation/package-box-measurement-export.routes'
import { createPackageBoxRoutes } from '../src/nfe-documents/presentation/package-box.routes'
import { createPendingItemsRoutes } from '../src/pending-items/presentation/pending-items.routes'
import { createTripDocumentReviewRoutes } from '../src/trips/presentation/trip-document-review.routes'
import {
  createTripFieldOfficeRoutes,
  OFFICE_REPORT_POLICY,
} from '../src/trips/presentation/trip-field-office.routes'
import { createTripFieldOfficeOccurrenceRoutes } from '../src/trips/presentation/trip-field-office-occurrence.routes'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'
import { createMeTripRoutes } from '../src/trips/presentation/me-trip.routes'
import { createDeliveryChargeRoutes } from '../src/delivery-clients/presentation/delivery-charge.routes'
import { createMeOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/me-occurrence-conversation.routes'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'

/**
 * Spec 235 D7: o ajudante acompanha a viagem e não reporta nada. A lista de rotas é a mesma do
 * contrato do separador, com as do app do motorista (`/me`) — é nelas que `trip.read` e `trip.report`
 * se separam.
 *
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
      subject: 'helper',
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
    ...createCompanyCrewSettingsRoutes(dependencies),
    ...createBillingRoutes(dependencies),
    ...createCteIssuanceRoutes(dependencies),
    ...createNfeDocumentRoutes(dependencies),
    ...createPackageBoxRoutes(dependencies),
    ...createPackageBoxMeasurementExportRoutes(dependencies),
    ...createPendingItemsRoutes(dependencies),
    ...createTripDocumentReviewRoutes(dependencies),
    // Spec 156 T8b (revisão do code-reviewer): as rotas do escritório com autoria precisam entrar
    // aqui para a lista exaustiva **provar** a ausência delas — sem elas no array, o separador
    // "não alcançar" field-delivery/field-return era verdade por elas nunca terem sido testadas,
    // não porque a permissão as barrasse.
    ...createTripFieldOfficeRoutes(dependencies),
    ...createTripFieldOfficeOccurrenceRoutes(dependencies),
    // Spec 183 T404 (143 T016): o separador lê a conversa (`fleet.read`, como a listagem) e marca
    // como lida, mas **não** escreve à contratante nem vê a prévia (`occurrences.resolve`).
    ...createOccurrenceConversationRoutes(dependencies),
    ...createOccurrenceConversationUnassignedRoutes(dependencies),
    // Spec 183 T701 (RF12): as respostas rápidas são cadastro (`settings.manage`) e leitura de quem
    // escreve na conversa (`occurrences.resolve`) — o separador não alcança nenhuma das duas.
    ...createQuickReplyRoutes(dependencies),
    // Rotas do app do motorista: `trip.read` abre as de leitura, `trip.report` as de escrita.
    ...createMeTripRoutes(dependencies),
    ...createDeliveryChargeRoutes(dependencies),
    ...createMeOccurrenceConversationRoutes(dependencies),
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

describe('helper role contract', () => {
  test('carries trip.read and nothing else', () => {
    expect([...resolveCompanyPermissions(['helper'])]).toEqual(['trip.read'])
  })

  // `trip.read` abre a leitura do app do motorista; nenhuma rota de escrita, de frota ou de gestão.
  // Spec 243 D1: a cobrança de entrega (`/delivery-charges`, `/charge-rules`) é `trip.financials`.
  test('reaches only read routes of the driver app', () => {
    expect(reachableRoutes(['helper'])).toEqual([
      'GET /me/trips/current',
      'GET /me/trips/current/documents/:documentId/proof',
      'GET /me/trips/current/manifests/:manifestId',
      'GET /me/trips/current/manifests/:manifestId/damdfe',
      'GET /me/trips/current/occurrence-conversations',
      'GET /me/trips/current/occurrences/:id/messages',
      'POST /me/trips/current/occurrences/:id/messages/read',
    ])
  })

  // O que separa o ajudante do motorista é exatamente `trip.report`: toda escrita da viagem em campo
  test('is refused by every route that needs trip.report, fleet or trip management', () => {
    const helper = new Set(reachableRoutes(['helper']))
    const driver = reachableRoutes(['driver'])
    const driverOnly = driver.filter((route) => !helper.has(route))

    expect(driverOnly.length).toBeGreaterThan(0)
    for (const route of driverOnly) {
      expect(route).toContain(' /me/trips/current')
    }
    expect(helper.has('POST /me/trips/current/documents/:documentId/deliver')).toBe(false)
    expect(helper.has('POST /me/trips/current/documents/:documentId/proof')).toBe(false)
    expect(helper.has('POST /me/trips/current/documents/:documentId/occurrences')).toBe(false)
    for (const route of [
      'GET /delivery-charges',
      'GET /delivery-clients/:id/charge-rules',
      'GET /trips',
      'GET /trips/:id',
      'POST /trips',
      'GET /fleet/drivers',
      'GET /fleet/vehicles',
      'POST /fleet/drivers',
      'POST /trips/:id/mdfe-manifests',
    ]) {
      expect(helper.has(route)).toBe(false)
    }
  })

  test('is refused by the office policy that reports a delivery on behalf of the driver', () => {
    const service = new AuthorizationService()

    expect(() => service.authorize(companyContext(['helper']), OFFICE_REPORT_POLICY)).toThrow()
  })

  test('holds none of the other permissions a driver or the office hold', () => {
    const permissions = resolveCompanyPermissions(['helper'])

    for (const permission of [
      'trip.report',
      'trip.report-on-behalf',
      'trip.manage',
      'trip.financials',
      'fleet.read',
      'fleet.manage',
      'mdfe.read',
      'mdfe.manage',
      'invoices.read',
      'settings.manage',
      'users.manage',
    ] as const) {
      expect(permissions.has(permission)).toBe(false)
    }
  })
})
