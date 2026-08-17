/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { LOCAL_IDENTITY_ROLES } from '../src/database/local-identity-seed.constant'
import { AuthorizationService } from '../src/identity/application/authorization.service'
import {
  COMPANY_ROLE_PERMISSIONS,
  resolveCompanyPermissions,
  TRANSPORTADA_PERMISSIONS,
} from '../src/identity/domain/authorization.policy'
import type { AuthenticatedIdentity } from '../src/identity/domain/authenticated-identity'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../src/identity/domain/tenant-context'
import { ApiError } from '../src/shared/api.error'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'

describe('authorization contract', () => {
  test('defines the complete conservative permission matrix for every company role', () => {
    expect(TRANSPORTADA_PERMISSIONS).toEqual([
      'companies.manage',
      'users.manage',
      'invoices.import',
      'invoices.read',
      'batches.create',
      'batches.approve',
      'freight.simulate',
      'cte.manage',
      'cte.submit',
      'cte.issue',
      'cte.cancel',
      'cte.read',
      'billing.create',
      'billing.cancel',
      'billing.read',
      'settings.manage',
      'operations.read',
      'audit.read',
      'view-preferences.manage',
      'fleet.read',
      'fleet.manage',
      'mdfe.read',
      'mdfe.manage',
      'mdfe.issue',
      'mdfe.close',
      'mdfe.cancel',
      'nfse.manage',
      'nfse.issue',
      'nfse.cancel',
      'nfse.read',
      'trip.read',
      'trip.report',
    ])
    expect(COMPANY_ROLE_PERMISSIONS).toEqual({
      'company-admin': [
        'users.manage',
        'invoices.import',
        'invoices.read',
        'cte.manage',
        'cte.submit',
        'cte.read',
        'billing.create',
        'billing.cancel',
        'billing.read',
        'settings.manage',
        'operations.read',
        'audit.read',
        'view-preferences.manage',
        'fleet.read',
        'fleet.manage',
        'mdfe.read',
        'mdfe.manage',
        'nfse.manage',
        'nfse.issue',
        'nfse.cancel',
        'nfse.read',
      ],
      finance: [
        'cte.read',
        'billing.create',
        'billing.cancel',
        'billing.read',
        'operations.read',
        'view-preferences.manage',
        'nfse.read',
      ],
      fiscal: [
        'invoices.import',
        'invoices.read',
        'batches.create',
        'batches.approve',
        'freight.simulate',
        'cte.manage',
        'cte.submit',
        'cte.issue',
        'cte.cancel',
        'cte.read',
        'operations.read',
        'view-preferences.manage',
        'fleet.read',
        'mdfe.read',
        'mdfe.manage',
        'mdfe.issue',
        'mdfe.close',
        'mdfe.cancel',
        'nfse.manage',
        'nfse.issue',
        'nfse.cancel',
        'nfse.read',
      ],
      operator: [
        'invoices.import',
        'invoices.read',
        'batches.create',
        'freight.simulate',
        'cte.manage',
        'cte.submit',
        'cte.read',
        'operations.read',
        'view-preferences.manage',
        'fleet.read',
        'fleet.manage',
        'mdfe.read',
        'mdfe.manage',
        'nfse.manage',
        'nfse.read',
      ],
      viewer: [
        'invoices.read',
        'cte.read',
        'operations.read',
        'view-preferences.manage',
        'fleet.read',
        'mdfe.read',
        'nfse.read',
      ],
      driver: ['trip.read', 'trip.report'],
    })
  })

  // O motorista é o menor conjunto do sistema — nota, CT-e, faturamento e frota ficam fora
  test('grants the driver role only its own trip permissions', () => {
    const permissions = resolveCompanyPermissions(['driver'])

    expect([...permissions]).toEqual(['trip.read', 'trip.report'])
    for (const denied of [
      'invoices.read',
      'cte.read',
      'billing.read',
      'fleet.read',
      'mdfe.read',
      'operations.read',
      'view-preferences.manage',
    ] as const) {
      expect(permissions.has(denied)).toBe(false)
    }
  })

  test('keeps trip permissions exclusive to the driver role', () => {
    for (const role of ['company-admin', 'finance', 'fiscal', 'operator', 'viewer'] as const) {
      const permissions = resolveCompanyPermissions([role])
      expect(permissions.has('trip.read')).toBe(false)
      expect(permissions.has('trip.report')).toBe(false)
    }
  })

  // Instalação dedicada: quem administra o ambiente emite a nota de serviço. A lista de perfis
  // exige a mesma `nfse.issue` da emissão — sem ela o diálogo abria sem perfil e sem prévia.
  test('lets the company admin issue and cancel the municipal service invoice', () => {
    const permissions = resolveCompanyPermissions(['company-admin'])

    for (const granted of ['nfse.manage', 'nfse.issue', 'nfse.cancel', 'nfse.read'] as const) {
      expect(permissions.has(granted)).toBe(true)
    }

    for (const role of ['operator', 'finance', 'viewer', 'driver'] as const) {
      expect(resolveCompanyPermissions([role]).has('nfse.issue')).toBe(false)
    }
  })

  test('restricts the MDF-e fiscal events to the fiscal role', () => {
    for (const role of ['company-admin', 'operator', 'viewer', 'finance', 'driver'] as const) {
      const permissions = resolveCompanyPermissions([role])
      expect(permissions.has('mdfe.issue')).toBe(false)
      expect(permissions.has('mdfe.close')).toBe(false)
      expect(permissions.has('mdfe.cancel')).toBe(false)
    }

    const fiscal = resolveCompanyPermissions(['fiscal'])
    expect(fiscal.has('mdfe.issue')).toBe(true)
    expect(fiscal.has('mdfe.close')).toBe(true)
    expect(fiscal.has('mdfe.cancel')).toBe(true)
  })

  // O usuário do seed local existe para exercitar qualquer feature sem trocar de conta:
  // papel de menos ali some com botão na tela e devolve 403 sem que nada esteja quebrado
  test('grants the local seed user every company permission', () => {
    const permissions = resolveCompanyPermissions([...LOCAL_IDENTITY_ROLES])
    const companyPermissions = TRANSPORTADA_PERMISSIONS.filter(
      (permission) => permission !== 'companies.manage',
    )

    expect([...permissions]).toEqual(companyPermissions)
    // A permissão de plataforma segue reservada e sem rota consumidora (ADR-0021)
    expect([...permissions]).not.toContain('companies.manage')
  })

  test('unions local roles into an immutable permission set without platform access', () => {
    const permissions = resolveCompanyPermissions(['viewer', 'fiscal', 'viewer'])

    expect([...permissions]).toEqual([
      'invoices.import',
      'invoices.read',
      'batches.create',
      'batches.approve',
      'freight.simulate',
      'cte.manage',
      'cte.submit',
      'cte.issue',
      'cte.cancel',
      'cte.read',
      'operations.read',
      'view-preferences.manage',
      'fleet.read',
      'mdfe.read',
      'mdfe.manage',
      'mdfe.issue',
      'mdfe.close',
      'mdfe.cancel',
      'nfse.manage',
      'nfse.issue',
      'nfse.cancel',
      'nfse.read',
    ])
    expect([...permissions]).not.toContain('companies.manage')
    expect(Object.isFrozen(permissions)).toBe(true)
    expect('add' in permissions).toBe(false)
    expect((permissions as unknown as { readonly add?: unknown }).add).toBeUndefined()
    expect(permissions).not.toHaveProperty('add')
    expect(permissions).not.toHaveProperty('delete')
    expect(permissions).not.toHaveProperty('clear')
  })

  test('does not leak the mutable backing set through forEach', () => {
    const permissions = resolveCompanyPermissions(['viewer'])

    permissions.forEach((_value, _sameValue, exposedSet) => {
      const leakedAdd = (
        exposedSet as unknown as {
          readonly add?: (permission: string) => unknown
        }
      ).add
      leakedAdd?.('cte.issue')
    })

    expect(permissions.has('cte.issue')).toBe(false)
    expect(() =>
      new AuthorizationService().authorize(companyContext(['viewer']), {
        permission: 'cte.issue',
        scope: 'company',
      }),
    ).toThrow(expectForbidden())
  })

  test('does not leak the mutable backing set through inherited object methods', () => {
    const permissions = resolveCompanyPermissions(['viewer'])
    const exposedValueOf = (
      permissions as unknown as {
        readonly valueOf?: () => unknown
      }
    ).valueOf

    expect(exposedValueOf).toBeUndefined()
    expect(permissions.has('cte.issue')).toBe(false)
  })

  test('keeps an empty membership at zero permissions', () => {
    const permissions = resolveCompanyPermissions([])

    expect(permissions.size).toBe(0)
    expect([...permissions]).toEqual([])
  })

  test('freezes the matrix and every role assignment', () => {
    expect(Object.isFrozen(TRANSPORTADA_PERMISSIONS)).toBe(true)
    expect(Object.isFrozen(COMPANY_ROLE_PERMISSIONS)).toBe(true)
    for (const permissions of Object.values(COMPANY_ROLE_PERMISSIONS)) {
      expect(Object.isFrozen(permissions)).toBe(true)
    }
  })

  test('allows only an explicit matching company policy', () => {
    const service = new AuthorizationService()
    const context = companyContext(['viewer'])

    expect(() =>
      service.authorize(context, {
        permission: 'invoices.read',
        scope: 'company',
      }),
    ).not.toThrow()
    expect(() =>
      service.authorize(context, {
        permission: 'invoices.import',
        scope: 'company',
      }),
    ).toThrow(expectForbidden())
  })

  test('denies missing policy by default before a use case can execute', () => {
    const service = new AuthorizationService()
    let useCaseCalls = 0

    try {
      service.authorize(companyContext(['company-admin']), undefined)
      useCaseCalls += 1
    } catch (error: unknown) {
      expect(error).toEqual(expectForbidden())
    }

    expect(useCaseCalls).toBe(0)
  })

  test('keeps platform and company authorization mutually exclusive', () => {
    const service = new AuthorizationService()
    const company = companyContext(['company-admin'])
    const platform = platformContext()

    expect(() =>
      service.authorize(platform, {
        permission: 'companies.manage',
        scope: 'platform',
      }),
    ).not.toThrow()
    expect(() =>
      service.authorize(company, {
        permission: 'companies.manage',
        scope: 'platform',
      }),
    ).toThrow(expectForbidden())
    expect(() =>
      service.authorize(platform, {
        permission: 'invoices.read',
        scope: 'company',
      }),
    ).toThrow(expectForbidden())
  })

  test('returns the same safe 403 without revealing role, permission or tenant', () => {
    const service = new AuthorizationService()

    const error = captureError(() =>
      service.authorize(companyContext([]), {
        permission: 'settings.manage',
        scope: 'company',
      }),
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
      status: 403,
    })
    for (const sensitive of ['settings.manage', 'company-admin', COMPANY_ID, USER_ID]) {
      expect(String(error)).not.toContain(sensitive)
      expect(JSON.stringify(error)).not.toContain(sensitive)
    }
  })
})

function companyContext(roles: CompanyContext['roles']): AuthenticatedContext<CompanyContext> {
  const identity = authenticatedIdentity()
  return {
    identity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: resolveCompanyPermissions(roles),
      roles,
      userId: USER_ID,
    },
  }
}

function platformContext(): AuthenticatedContext<PlatformContext> {
  return {
    identity: authenticatedIdentity({ platformAdmin: true }),
    scope: {
      kind: 'platform',
      userId: USER_ID,
    },
  }
}

function authenticatedIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
): AuthenticatedIdentity {
  return {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000004',
    issuer: 'https://identity.example.test/realms/transportada',
    platformAdmin: false,
    subject: 'keycloak-user',
    userId: USER_ID,
    ...overrides,
  }
}

function expectForbidden(): ReturnType<typeof expect.objectContaining> {
  return expect.objectContaining({
    code: 'FORBIDDEN',
    message: 'Access denied',
    status: 403,
  })
}

function captureError(run: () => void): unknown {
  try {
    run()
  } catch (error: unknown) {
    return error
  }

  throw new Error('Expected operation to fail')
}
