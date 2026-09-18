/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T13, ADR-0069 §6: o assistente de baixa do escritório precisa saber se a leitura do
 * canhoto está ligada, e quem dá a baixa (`trip.report-on-behalf`) não tem `settings.manage`. A rota
 * devolve **só** o interruptor — a configuração inteira do comprovante segue no painel.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripFieldDeliverySettingsRoutes } from '../../src/trips/presentation/trip-field-delivery-settings.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function buildRoute(enabled: boolean) {
  const calls: unknown[] = []
  const [route] = createTripFieldDeliverySettingsRoutes({
    readCanhotoOcrEnabled: async (input) => {
      calls.push(input)
      return enabled
    },
  })
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return { calls, route }
}

describe('GET /trips/field-delivery-settings (spec 156 T13, ADR-0069 §6)', () => {
  it('é uma rota só, GET, em /trips/field-delivery-settings, com trip.report-on-behalf', () => {
    const routes = createTripFieldDeliverySettingsRoutes({
      readCanhotoOcrEnabled: async () => false,
    })

    expect(routes).toHaveLength(1)
    expect(routes[0]!.method).toBe('GET')
    expect(routes[0]!.pathname).toBe('/trips/field-delivery-settings')
    expect(routes[0]!.policy).toEqual({ permission: 'trip.report-on-behalf', scope: 'company' })
  })

  it('lê pela empresa do contexto e devolve só o interruptor, sem cache', async () => {
    const { calls, route } = buildRoute(true)

    const response = await route.execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request('http://localhost/trips/field-delivery-settings'),
    })

    expect(calls).toEqual([{ companyId: COMPANY_ID }])
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { canhotoOcrEnabled: true } })
  })

  it('desligado responde false', async () => {
    const { route } = buildRoute(false)

    const response = await route.execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request('http://localhost/trips/field-delivery-settings'),
    })

    expect(await response.json()).toEqual({ data: { canhotoOcrEnabled: false } })
  })

  it('o separador e o motorista não alcançam; company-admin, operator e finance alcançam', () => {
    const { route } = buildRoute(false)
    const permission = route.policy?.permission as never

    expect(resolveCompanyPermissions(['separator']).has(permission)).toBe(false)
    expect(resolveCompanyPermissions(['driver']).has(permission)).toBe(false)
    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      expect(resolveCompanyPermissions([role]).has(permission)).toBe(true)
    }
  })
})
