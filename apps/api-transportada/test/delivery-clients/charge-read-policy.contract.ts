/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLES, type CompanyRole } from '../../src/database/identity.schema.js'
import { createDeliveryChargeRoutes } from '../../src/delivery-clients/presentation/delivery-charge.routes.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'

const LIST_CHARGES = 'GET /delivery-charges'
const LIST_CHARGE_RULES = 'GET /delivery-clients/:id/charge-rules'

/**
 * Spec 243 D1: a cobrança de entrega é leitura do **escritório** (`trip.financials`). As duas rotas
 * devolvem a empresa inteira, sem recorte pelo vínculo — com `trip.read`, motorista, agregado,
 * separador e ajudante liam as cobranças de todo mundo (`docs/SECURITY.md`, 2026-09-18).
 *
 * Um caso por papel e por rota, escrito por extenso: a tabela cobre `COMPANY_ROLES` inteiro, e papel
 * novo sem linha aqui reprova o último teste.
 */
const OFFICE_READERS: readonly CompanyRole[] = ['company-admin', 'finance', 'operator']
const REFUSED_ROLES: readonly CompanyRole[] = [
  'driver',
  'aggregate',
  'separator',
  'helper',
  'viewer',
  'fiscal',
  'contractor',
  'automation',
]

function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

function companyContext(role: CompanyRole): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: role,
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: MEMBERSHIP_ID,
      permissions: resolveCompanyPermissions([role]),
      roles: [role],
      userId: USER_ID,
    },
  }
}

function authorizeRoute(input: {
  readonly role: CompanyRole
  readonly route: string
}): 'allowed' | number {
  const route = createDeliveryChargeRoutes(unusedDependencies() as never).find(
    (candidate) => `${candidate.method} ${candidate.pathname}` === input.route,
  )
  if (route === undefined) throw new Error(`rota ausente: ${input.route}`)
  try {
    new AuthorizationService().authorize(companyContext(input.role), route.policy)
    return 'allowed'
  } catch (error) {
    if (error instanceof ApiError) return error.status
    throw error
  }
}

describe('leitura da cobrança de entrega é do escritório (spec 243 D1)', () => {
  for (const route of [LIST_CHARGES, LIST_CHARGE_RULES]) {
    for (const role of OFFICE_READERS) {
      test(`${role} lê ${route}`, () => {
        expect(authorizeRoute({ role, route })).toBe('allowed')
      })
    }
    for (const role of REFUSED_ROLES) {
      test(`${role} recebe 403 em ${route}`, () => {
        expect(authorizeRoute({ role, route })).toBe(403)
      })
    }
  }

  test('a tabela classifica todo papel da empresa, uma vez só', () => {
    const classified = [...OFFICE_READERS, ...REFUSED_ROLES]

    expect(new Set(classified).size).toBe(classified.length)
    expect([...classified].sort()).toEqual([...COMPANY_ROLES].sort())
  })

  test('finance lê a cobrança mas não confirma nem descarta (escrita segue trip.manage)', () => {
    expect(authorizeRoute({ role: 'finance', route: 'POST /delivery-charges/confirm' })).toBe(403)
    expect(authorizeRoute({ role: 'finance', route: 'POST /delivery-charges/:id/dismiss' })).toBe(
      403,
    )
    expect(authorizeRoute({ role: 'operator', route: 'POST /delivery-charges/confirm' })).toBe(
      'allowed',
    )
  })
})
