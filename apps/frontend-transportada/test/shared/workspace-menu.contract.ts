/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  resolveNavigationMenu,
  resolveVisibleNavigationGroups,
} from '../../src/modules/shared/workspaceAccess.service'
import {
  NAVIGATION_GROUPS,
  WORKSPACE_NAVIGATION_ITEMS,
} from '../../src/modules/shared/workspaceNavigation.constant'

/**
 * Spec 221: permissões por papel transcritas de `COMPANY_ROLE_PERMISSIONS`
 * (apps/api-transportada/src/identity/domain/authorization.policy.ts:115 em diante, verificado em
 * 2026-10-01). O painel não importa código da API; mudou o papel lá, esta tabela muda aqui.
 */
const COMPANY_ADMIN_PERMISSIONS = [
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
  'trip.event-location',
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
] as const

const SEPARATOR_PERMISSIONS = [
  'invoices.read',
  'fleet.read',
  'trip.read',
  'trip.manage',
  'cargo.measure',
] as const

const DRIVER_PERMISSIONS = ['trip.read', 'trip.report'] as const

const FISCAL_PERMISSIONS = [
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
  'trip.event-location',
  'mdfe.read',
  'mdfe.manage',
  'mdfe.issue',
  'mdfe.close',
  'mdfe.cancel',
  'nfse.manage',
  'nfse.issue',
  'nfse.cancel',
  'nfse.read',
] as const

const OPERATOR_PERMISSIONS = [
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
  'trip.event-location',
  'fleet.manage',
  'mdfe.read',
  'mdfe.manage',
  'nfse.manage',
  'nfse.read',
  'trip.manage',
  'trip.report-on-behalf',
  'trip.financials',
  'cargo.measure',
  'occurrences.resolve',
] as const

/** As permissões somam: é a conta que acumula `driver` e `separator` (CA16, D10). */
const DRIVER_AND_SEPARATOR_PERMISSIONS = [...DRIVER_PERMISSIONS, ...SEPARATOR_PERMISSIONS]

/** Os 19 itens que o menu tinha antes da spec — CA02: o `company-admin` não perde nenhum. */
const MENU_BEFORE_SPEC_221 = [
  'nfe',
  'freight',
  'cte-batch',
  'trip',
  'mdfe-manifest',
  'billing',
  'extra-charges',
  'reimbursements',
  'trip-financials',
  'nfse-invoice',
  'operations',
  'trip-occurrences',
  'fleet',
  'pendencias',
  'delivery-clients',
  'cte-profiles',
  'users',
  'access-profiles',
  'company-settings',
]

function menuOf(permissions: readonly string[]): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    resolveVisibleNavigationGroups(permissions).map((group) => [
      group.key,
      group.items.map(({ key }) => key),
    ]),
  )
}

function flatKeysOf(permissions: readonly string[]): readonly string[] {
  return Object.values(menuOf(permissions)).flat()
}

describe('o menu filtra por permissão — separator (CA01, CA04)', () => {
  test('tem exatamente NF-e, Viagens, Ocorrências, Frota e Pendências', () => {
    expect([...flatKeysOf(SEPARATOR_PERMISSIONS)].sort()).toEqual(
      ['fleet', 'nfe', 'pendencias', 'trip', 'trip-occurrences'].sort(),
    )
  })

  test('em três grupos: Fiscal, Operações e Cadastros', () => {
    expect(menuOf(SEPARATOR_PERMISSIONS)).toEqual({
      fiscal: ['nfe', 'trip'],
      operations: ['trip-occurrences'],
      registries: ['fleet', 'pendencias'],
    })
  })

  test('grupo cujos itens todos caíram não é devolvido (Usuários e Administração)', () => {
    const keys = resolveVisibleNavigationGroups(SEPARATOR_PERMISSIONS).map(({ key }) => key)

    expect(keys).not.toContain('identity')
    expect(keys).not.toContain('administration')
  })

  test('não mostra Minha viagem (CA17)', () => {
    expect(flatKeysOf(SEPARATOR_PERMISSIONS)).not.toContain('driver-trip')
  })
})

describe('o menu filtra por permissão — company-admin (CA02)', () => {
  test('nenhum dos 19 itens de antes desaparece', () => {
    expect([...flatKeysOf(COMPANY_ADMIN_PERMISSIONS)].sort()).toEqual(
      [...MENU_BEFORE_SPEC_221].sort(),
    )
  })

  test('os cinco grupos continuam aparecendo, na ordem do menu', () => {
    expect(resolveVisibleNavigationGroups(COMPANY_ADMIN_PERMISSIONS).map(({ key }) => key)).toEqual(
      NAVIGATION_GROUPS.map(({ key }) => key),
    )
  })

  test('a ordem dos itens dentro do grupo é a do menu', () => {
    const fiscal = resolveVisibleNavigationGroups(COMPANY_ADMIN_PERMISSIONS)[0]
    const original = NAVIGATION_GROUPS[0]

    expect(fiscal?.items).toEqual(original?.items)
  })
})

describe('o menu filtra por permissão — fiscal (CA03)', () => {
  test('o grupo Usuários não aparece', () => {
    const keys = resolveVisibleNavigationGroups(FISCAL_PERMISSIONS).map(({ key }) => key)

    expect(keys).not.toContain('identity')
  })

  test('CT-e, MDF-e e NFS-e aparecem', () => {
    const keys = flatKeysOf(FISCAL_PERMISSIONS)

    for (const expected of ['cte-batch', 'mdfe-manifest', 'nfse-invoice']) {
      expect(keys).toContain(expected)
    }
  })

  test('Frete aparece por freight.simulate, sem settings.manage', () => {
    expect(flatKeysOf(FISCAL_PERMISSIONS)).toContain('freight')
  })
})

describe('o menu filtra por permissão — Repasses e Minha viagem (RF-E6, CA16, CA17)', () => {
  test('Repasses aparece para operator e company-admin, e não para o separator', () => {
    expect(flatKeysOf(OPERATOR_PERMISSIONS)).toContain('extra-charges')
    expect(flatKeysOf(COMPANY_ADMIN_PERMISSIONS)).toContain('extra-charges')
    expect(flatKeysOf(SEPARATOR_PERMISSIONS)).not.toContain('extra-charges')
  })

  test('Minha viagem aparece para quem tem trip.report, no grupo Operações', () => {
    expect(menuOf(DRIVER_AND_SEPARATOR_PERMISSIONS).operations).toContain('driver-trip')
  })

  test('o motorista-separador ainda tem os cinco itens do separador, mais Minha viagem', () => {
    expect([...flatKeysOf(DRIVER_AND_SEPARATOR_PERMISSIONS)].sort()).toEqual(
      ['driver-trip', 'fleet', 'nfe', 'pendencias', 'trip', 'trip-occurrences'].sort(),
    )
  })

  test('não aparece para o operator nem para o company-admin', () => {
    expect(flatKeysOf(OPERATOR_PERMISSIONS)).not.toContain('driver-trip')
    expect(flatKeysOf(COMPANY_ADMIN_PERMISSIONS)).not.toContain('driver-trip')
  })

  test('não aparece para o fiscal', () => {
    expect(flatKeysOf(FISCAL_PERMISSIONS)).not.toContain('driver-trip')
  })

  test('a conta de campo pura só tem Minha viagem', () => {
    expect(menuOf(DRIVER_PERMISSIONS)).toEqual({ operations: ['driver-trip'] })
  })

  test('o título da tela de Minha viagem continua saindo da lista de itens', () => {
    const title = WORKSPACE_NAVIGATION_ITEMS.find(({ key }) => key === 'driver-trip')?.label

    expect(title).toBe('Minha viagem')
  })

  test('a notificação nunca aparece em grupo algum', () => {
    expect(flatKeysOf(COMPANY_ADMIN_PERMISSIONS)).not.toContain('notification')
  })
})

describe('o estado do menu enquanto as permissões chegam (RF-B3, RF-B4)', () => {
  test('carregando: esqueleto, nunca a lista inteira', () => {
    expect(resolveNavigationMenu({ hasFailed: false, permissions: undefined })).toEqual({
      kind: 'loading',
    })
  })

  test('falha de leitura: menu mínimo, sem item algum', () => {
    expect(resolveNavigationMenu({ hasFailed: true, permissions: undefined })).toEqual({
      groups: [],
      kind: 'ready',
    })
  })

  test('permissões vazias: nenhum grupo', () => {
    expect(resolveNavigationMenu({ hasFailed: false, permissions: [] })).toEqual({
      groups: [],
      kind: 'ready',
    })
  })

  test('permissões conhecidas: o menu filtrado', () => {
    const state = resolveNavigationMenu({ hasFailed: false, permissions: SEPARATOR_PERMISSIONS })

    expect(state.kind).toBe('ready')
    expect(
      state.kind === 'ready' ? state.groups.flatMap((group) => group.items.length) : [],
    ).toEqual([2, 1, 2])
  })

  test('refetch com falha mantém o menu das permissões que já chegaram', () => {
    const state = resolveNavigationMenu({ hasFailed: true, permissions: SEPARATOR_PERMISSIONS })

    expect(state.kind).toBe('ready')
    expect(state.kind === 'ready' ? state.groups.length : 0).toBe(3)
  })
})

describe('o painel usa o filtro no render da barra', () => {
  const shellPromise = Bun.file(new URL('../../src/main.tsx', import.meta.url)).text()

  test('a barra deriva os grupos de resolveNavigationMenu, não da lista inteira', async () => {
    const shell = await shellPromise

    expect(shell).toContain('resolveNavigationMenu')
    expect(shell).not.toContain('NAVIGATION_GROUPS.map')
  })

  test('o carregamento mostra o Skeleton na forma da barra', async () => {
    const shell = await shellPromise
    const start = shell.indexOf('className="sidebar-navigation"')
    const navigation = shell.slice(start, shell.indexOf('</nav>', start))

    expect(navigation).toContain("navigationMenu.kind === 'loading'")
    expect(navigation).toContain('<Skeleton')
  })
})
