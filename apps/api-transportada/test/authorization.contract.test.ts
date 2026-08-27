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
      'addresses.read',
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
      'trip.manage',
      'trip.report',
      'trip.financials',
      // ADR-0047 §4: a permissão do serviço, com escopo de uma rota só
      'mdfe.auto-issue',
      // ADR-0050: a permissão do contratante — acompanhar a entrega das notas dos documentos dele
      'deliveries.track',
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
        'addresses.read',
        'fleet.read',
        'fleet.manage',
        'mdfe.read',
        'mdfe.manage',
        'nfse.manage',
        'nfse.issue',
        'nfse.cancel',
        'nfse.read',
        'trip.manage',
        'trip.financials',
      ],
      finance: [
        'cte.read',
        'trip.financials',
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
        'addresses.read',
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
        'addresses.read',
        'fleet.read',
        'fleet.manage',
        'mdfe.read',
        'mdfe.manage',
        'nfse.manage',
        'nfse.read',
        'trip.manage',
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
      aggregate: ['trip.read', 'trip.report'],
      separator: ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage'],
      contractor: ['deliveries.track'],
      automation: ['mdfe.auto-issue'],
    })
  })

  // Os dois papéis de campo são o menor conjunto do sistema — nota, CT-e, faturamento e frota
  // ficam fora. O agregado se distingue do motorista pelo veículo que ele traz, não por permissão.
  test('grants the field roles only their own trip permissions', () => {
    for (const role of ['driver', 'aggregate'] as const) {
      const permissions = resolveCompanyPermissions([role])

      expect([...permissions]).toEqual(['trip.read', 'trip.report'])
      for (const denied of [
        'invoices.read',
        'cte.read',
        'billing.read',
        'fleet.read',
        'mdfe.read',
        'operations.read',
        'view-preferences.manage',
        'addresses.read',
        'trip.manage',
      ] as const) {
        expect(permissions.has(denied)).toBe(false)
      }
    }
  })

  /**
   * Spec 061 D4: **dinheiro tem permissão própria.** O valor pago ao motorista é dado sensível para
   * o próprio motorista, que tem `trip.read` — e o separador monta a carga sem precisar da margem.
   */
  /**
   * ADR-0049 §6: a lista encolheu — `operator` **perdeu** `trip.financials`. Quem monta a viagem
   * decide se vale montá-la pela avaliação prevista (065 D7), que não mostra o que se paga ao
   * agregado; e o valor pago ao motorista é dado sensível para quem trabalha ao lado dele.
   */
  test('keeps the trip financials away from every role but the owner and finance', () => {
    for (const role of [
      'driver',
      'aggregate',
      'separator',
      'viewer',
      'fiscal',
      'operator',
    ] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.financials')).toBe(false)
    }
    for (const role of ['company-admin', 'finance'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.financials')).toBe(true)
    }
  })

  // `trip.report` é do campo — o que o motorista reporta da própria viagem, e ninguém do escritório
  // reporta entrega por ele. `trip.manage` é o escritório: montar a viagem, vincular nota, marcar
  // entrega, encerrar. Ela nasceu para tirar `fleet.manage` dessas cinco rotas, que também apaga
  // veículo e motorista.
  test('keeps the delivery report exclusive to the field roles', () => {
    for (const role of [
      'company-admin',
      'finance',
      'fiscal',
      'operator',
      'viewer',
      'separator',
    ] as const) {
      const permissions = resolveCompanyPermissions([role])
      expect(permissions.has('trip.report')).toBe(false)
    }

    for (const role of ['company-admin', 'finance', 'fiscal', 'operator', 'viewer'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.read')).toBe(false)
    }
  })

  test('grants the trip write permission to the roles that already created trips', () => {
    for (const role of ['company-admin', 'operator', 'separator'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.manage')).toBe(true)
    }

    for (const role of ['finance', 'fiscal', 'viewer', 'driver', 'aggregate'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.manage')).toBe(false)
    }
  })

  // Instalação dedicada: quem administra o ambiente emite a nota de serviço. A lista de perfis
  // exige a mesma `nfse.issue` da emissão — sem ela o diálogo abria sem perfil e sem prévia.
  test('lets the company admin issue and cancel the municipal service invoice', () => {
    const permissions = resolveCompanyPermissions(['company-admin'])

    for (const granted of ['nfse.manage', 'nfse.issue', 'nfse.cancel', 'nfse.read'] as const) {
      expect(permissions.has(granted)).toBe(true)
    }

    for (const role of ['operator', 'finance', 'viewer', 'driver', 'aggregate'] as const) {
      expect(resolveCompanyPermissions([role]).has('nfse.issue')).toBe(false)
    }
  })

  // A consulta de CEP serve três formulários guardados por permissões diferentes (`fleet.manage`,
  // `settings.manage`, `mdfe.manage`), e a política de rota admite uma permissão só. `addresses.read`
  // é dela, concedida a quem já consegue escrever endereço em alguma das três telas — nem um papel
  // além disso: quem não preenche endereço não ganha capacidade nova.
  test('grants the address lookup to the roles that can write an address', () => {
    for (const role of ['company-admin', 'fiscal', 'operator'] as const) {
      expect(resolveCompanyPermissions([role]).has('addresses.read')).toBe(true)
    }

    for (const role of ['finance', 'viewer', 'driver', 'aggregate'] as const) {
      expect(resolveCompanyPermissions([role]).has('addresses.read')).toBe(false)
    }
  })

  test('restricts the MDF-e fiscal events to the fiscal role', () => {
    for (const role of [
      'company-admin',
      'operator',
      'viewer',
      'finance',
      'driver',
      'aggregate',
    ] as const) {
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
    /**
     * `mdfe.auto-issue` fica de fora de propósito (ADR-0047 §4): ela é do **serviço**, e nenhum papel
     * de gente a concede. Um humano que a tivesse dispararia emissão fiscal pela rota de máquina.
     */
    const companyPermissions = TRANSPORTADA_PERMISSIONS.filter(
      /**
       * ADR-0050: `deliveries.track` sai junto — ela é do contratante, e o recorte dela não é o
       * papel e sim o vínculo com o documento. Somá-la a um papel da transportadora daria a alguém
       * de dentro uma leitura que já existe mais ampla em `invoices.read`.
       */
      (permission) =>
        permission !== 'companies.manage' &&
        permission !== 'mdfe.auto-issue' &&
        permission !== 'deliveries.track',
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
      'addresses.read',
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
    serviceAccount: false,
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
