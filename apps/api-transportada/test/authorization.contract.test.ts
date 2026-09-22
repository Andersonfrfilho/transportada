/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { LOCAL_IDENTITY_ROLES } from '../src/database/local-identity-seed.constant'
import { AuthorizationService } from '../src/identity/application/authorization.service'
import {
  COMPANY_ROLE_PERMISSIONS,
  isGrantablePermission,
  resolveCompanyPermissions,
  SERVICE_ONLY_PERMISSIONS,
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
      'users.reveal',
      'groups.manage',
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
      'operations.run',
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
      // ADR-0067: o escritório dá baixa pelo motorista, sem abrir as rotas `/me` do campo
      'trip.report-on-behalf',
      'trip.financials',
      // ADR-0047 §4: a permissão do serviço, com escopo de uma rota só
      'mdfe.auto-issue',
      // Spec 144 T014: a liquidação do WhatsApp, pela mesma régua — uma rota só, do serviço
      'whatsapp.settle',
      // Spec 085 G005: medir a caixa é galpão, e não sai de carona com `settings.manage`
      'cargo.measure',
      // ADR-0050: a permissão do contratante — acompanhar a entrega das notas dos documentos dele
      'deliveries.track',
      // ADR-0050 §6: decidir repasse é dinheiro, e não sai de carona com acompanhar entrega
      'charges.decide',
      // Spec 164 T6: tratar a tratativa da ocorrência é do escritório — nunca separador/driver/aggregate
      'occurrences.resolve',
      // Spec 164 T9: o contratante decide a tratativa que chegou até ele — só o papel contractor
      'occurrences.decide',
    ])
    expect(COMPANY_ROLE_PERMISSIONS).toEqual({
      'company-admin': [
        'users.manage',
        'users.reveal',
        'groups.manage',
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
        'operations.run',
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
        'trip.report-on-behalf',
        'trip.financials',
        'cargo.measure',
        'occurrences.resolve',
      ],
      finance: [
        'cte.read',
        'trip.report-on-behalf',
        'trip.financials',
        'billing.create',
        'billing.cancel',
        'billing.read',
        'operations.read',
        'view-preferences.manage',
        'nfse.read',
        'occurrences.resolve',
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
        'trip.report-on-behalf',
        /** ADR-0049 §6, emendada: quem escolhe a carga vê o que ela custa. */
        'trip.financials',
        'cargo.measure',
        'occurrences.resolve',
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
      separator: ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage', 'cargo.measure'],
      contractor: ['deliveries.track', 'charges.decide', 'occurrences.decide'],
      automation: ['mdfe.auto-issue', 'whatsapp.settle'],
    })
  })

  /**
   * Spec 164 T6: tratar a tratativa da ocorrência (revisar, devolver ao galpão, enviar ao
   * contratante, fechar, cancelar) é decisão do escritório. O separador monta a viagem no galpão,
   * mas não decide o desfecho da ocorrência; motorista e agregado só reportam campo.
   */
  test('grants occurrences.resolve only to the office roles', () => {
    for (const role of ['company-admin', 'finance', 'operator'] as const) {
      expect(resolveCompanyPermissions([role]).has('occurrences.resolve')).toBe(true)
    }
    for (const role of [
      'fiscal',
      'viewer',
      'driver',
      'aggregate',
      'separator',
      'contractor',
      'automation',
    ] as const) {
      expect(resolveCompanyPermissions([role]).has('occurrences.resolve')).toBe(false)
    }
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
  /**
   * ADR-0049 §6, **emendada**: quem escolhe a carga precisa ver o que ela custa. O `operator` é o
   * atendente que monta o roteiro e decide se a viagem vale a pena — decisão que precisa de custo e
   * receita lado a lado, não só da receita.
   *
   * ⚠️ O `separator` **continua fora**, e é ele que a exclusão original realmente descrevia: ele
   * trabalha no barracão, ao lado dos motoristas, e não escolhe carga nenhuma. Quem o incluir aqui
   * põe o pagamento do agregado na tela de quem senta ao lado dele.
   */
  test('keeps the trip financials with who chooses the load, and away from the warehouse', () => {
    for (const role of ['driver', 'aggregate', 'separator', 'viewer', 'fiscal'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.financials')).toBe(false)
    }
    for (const role of ['company-admin', 'finance', 'operator'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.financials')).toBe(true)
    }
  })

  // `trip.report` é do campo — o que o motorista reporta da própria viagem pelas rotas `/me`. O
  // escritório dá baixa por ele com outra permissão (ADR-0067), nunca com esta. `trip.manage` é o escritório: montar a viagem, vincular nota, marcar
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

  /**
   * ADR-0067 (spec 156 D1): o escritório dá baixa **em nome do motorista** com permissão própria.
   * Não é `trip.manage`, porque o separador a tem e não reporta entrega; não é `trip.report`, porque
   * ela abre as rotas `/me` do motorista.
   */
  test('grants the office delivery report on behalf of the driver only to the office roles', () => {
    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.report-on-behalf')).toBe(true)
    }

    for (const role of [
      'separator',
      'driver',
      'aggregate',
      'viewer',
      'fiscal',
      'contractor',
      'automation',
    ] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.report-on-behalf')).toBe(false)
    }
  })

  test('does not hand the office delivery report to whoever manages or reports the trip', () => {
    const separator = resolveCompanyPermissions(['separator'])
    expect(separator.has('trip.manage')).toBe(true)
    expect(separator.has('trip.report-on-behalf')).toBe(false)

    for (const role of ['driver', 'aggregate'] as const) {
      const permissions = resolveCompanyPermissions([role])
      expect(permissions.has('trip.report')).toBe(true)
      expect(permissions.has('trip.report-on-behalf')).toBe(false)
    }

    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      expect(resolveCompanyPermissions([role]).has('trip.report')).toBe(false)
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
        permission !== 'whatsapp.settle' &&
        permission !== 'deliveries.track' &&
        permission !== 'charges.decide' &&
        permission !== 'occurrences.decide',
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

/**
 * O efetivo de alguém passou a ser a união de três origens: papel do catálogo, grupo que a empresa
 * criou, e permissão concedida direto à pessoa. Somar é o que torna o grupo uma camada a mais em vez
 * de um segundo modelo de autorização convivendo com o primeiro.
 */
describe('permissão efetiva — a soma das três origens', () => {
  test('o grupo acrescenta ao que o papel já dava', () => {
    const permissions = resolveCompanyPermissions({
      granted: ['billing.read'],
      roles: ['viewer'],
    })

    expect(permissions.has('billing.read')).toBe(true)
    expect(permissions.has('invoices.read')).toBe(true)
  })

  test('nenhuma origem tira o que a outra deu', () => {
    const withoutGrants = resolveCompanyPermissions({ granted: [], roles: ['fiscal'] })
    const withGrants = resolveCompanyPermissions({ granted: ['billing.read'], roles: ['fiscal'] })

    for (const permission of withoutGrants) {
      expect(withGrants.has(permission)).toBe(true)
    }
  })

  /**
   * A coluna de permissão não tem CHECK: uma linha antiga com nome removido do catálogo derrubaria o
   * login de quem a tivesse. Ignorar mantém a pessoa entrando com o que ainda existe.
   */
  test('nome fora do catálogo é ignorado, não derruba o acesso', () => {
    const permissions = resolveCompanyPermissions({
      granted: ['permissao.que.nao.existe', 'billing.read'],
      roles: ['viewer'],
    })

    expect(permissions.has('billing.read')).toBe(true)
    expect([...permissions]).not.toContain('permissao.que.nao.existe')
  })

  /** Conceder plataforma por grupo seria o caminho mais silencioso para furar a instalação dedicada. */
  test('companies.manage não entra por concessão', () => {
    const permissions = resolveCompanyPermissions({
      granted: ['companies.manage'],
      roles: ['company-admin'],
    })

    expect([...permissions]).not.toContain('companies.manage')
  })

  test('a lista de papéis sozinha continua valendo, sem envelope', () => {
    expect([...resolveCompanyPermissions(['viewer'])]).toEqual([
      ...resolveCompanyPermissions({ roles: ['viewer'] }),
    ])
  })

  test('sem papel e sem concessão, ninguém alcança nada', () => {
    expect([...resolveCompanyPermissions({ granted: [], roles: [] })]).toEqual([])
  })
})

/**
 * Spec 144 T014b (revisão da Fase 3, M1): permissão de **máquina** não se concede a pessoa. Quem tem
 * `groups.manage` concederia a si mesmo `whatsapp.settle` e liquidaria pedido alheio — e
 * `mdfe.auto-issue` dispararia MDF-e pela rota do serviço.
 */
describe('permissão de serviço (spec 144 T014b)', () => {
  test('as duas permissões de máquina estão declaradas como de serviço', () => {
    expect([...SERVICE_ONLY_PERMISSIONS]).toEqual(['mdfe.auto-issue', 'whatsapp.settle'])
  })

  test('permissão de serviço não é concedível, e a de pessoa continua sendo', () => {
    for (const permission of SERVICE_ONLY_PERMISSIONS) {
      expect(isGrantablePermission(permission)).toBe(false)
    }
    expect(isGrantablePermission('companies.manage')).toBe(false)
    expect(isGrantablePermission('coisa.nova')).toBe(false)
    expect(isGrantablePermission('billing.create')).toBe(true)
  })

  test('a linha já gravada em grupo ou concessão avulsa é ignorada na resolução', () => {
    const permissions = resolveCompanyPermissions({
      granted: ['mdfe.auto-issue', 'whatsapp.settle', 'billing.read'],
      roles: ['viewer'],
    })

    expect(permissions.has('mdfe.auto-issue')).toBe(false)
    expect(permissions.has('whatsapp.settle')).toBe(false)
    expect(permissions.has('billing.read')).toBe(true)
  })

  test('o papel automation continua recebendo as duas', () => {
    expect([...resolveCompanyPermissions({ granted: [], roles: ['automation'] })]).toEqual([
      'mdfe.auto-issue',
      'whatsapp.settle',
    ])
  })

  test('nenhum papel de gente concede permissão de serviço', () => {
    for (const [role, permissions] of Object.entries(COMPANY_ROLE_PERMISSIONS)) {
      if (role === 'automation') continue
      const roleGrants = new Set<string>(permissions)
      for (const permission of SERVICE_ONLY_PERMISSIONS) {
        expect({ permission, role, granted: roleGrants.has(permission) }).toEqual({
          granted: false,
          permission,
          role,
        })
      }
    }
  })
})
