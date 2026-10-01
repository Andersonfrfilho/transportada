/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  NAVIGATION_GROUPS,
  WORKSPACE_NAVIGATION_ITEMS,
} from '../../src/modules/shared/workspaceNavigation.constant'
import {
  WORKSPACE_PERMISSIONS,
  canOpenWorkspace,
  visibleWorkspaceKeys,
} from '../../src/modules/shared/workspaceAccess.service'

/**
 * Spec 221 RF-A3: transcrição da condição que cada página já aplica, no molde de
 * `trip/state-gates.contract.ts`. A origem verificada em 2026-10-01 está ao lado de cada linha —
 * mudou a condição na página, esta tabela e o mapa mudam juntos.
 */
const EXPECTED_WORKSPACE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  // nfeWorkspaceViewModel.service.ts:38 — a parede só cai quando faltam as duas
  nfe: ['invoices.read', 'invoices.import'],
  // freightViewModel.service.ts:42-46 — a parede só cai quando faltam as duas
  freight: ['settings.manage', 'freight.simulate'],
  // CteBatchWorkspace.page.tsx:75-76
  'cte-batch': ['cte.manage', 'cte.submit'],
  // canReadTrip (trip.constant.ts:25), usado em useTripWorkspace.hook.ts:243
  trip: ['fleet.read', 'trip.report-on-behalf'],
  // MdfeManifestWorkspace.page.tsx:99 → useMdfeManifests.hook.ts:63
  'mdfe-manifest': ['mdfe.read'],
  // billingViewModel.service.ts:34
  billing: ['billing.read'],
  // NfseInvoiceWorkspace.page.tsx:64-66 — duas abas: notas (nfse.read) e configuração (settings.manage)
  'nfse-invoice': ['nfse.read', 'settings.manage'],
  // operationsViewModel.service.ts:34
  operations: ['operations.read'],
  // TripOccurrencesWorkspace.page.tsx:54
  'trip-occurrences': ['fleet.read'],
  // useCompanySettings.hook.ts:50; a API exige o mesmo em company-settings.routes.ts:22
  'company-settings': ['settings.manage'],
  // companyUsersViewModel.service.ts:36
  users: ['users.manage'],
  // useCompanyGroups.hook.ts:24
  'access-profiles': ['groups.manage'],
  // cteProfilesViewModel.service.ts:20-21
  'cte-profiles': ['settings.manage'],
  // useFleet.hook.ts:78
  fleet: ['fleet.read'],
  // usePendingItems.hook.ts:28
  pendencias: ['fleet.read'],
  // useDeliveryClients.hook.ts:91 — governa a edição; a página abre em leitura com fleet.read
  'delivery-clients': ['fleet.manage'],
  // ⚠️ intenção de produto, não transcrição (spec 221 D4): a API lê com trip.read e a página não
  // tem parede. `trip.manage` deixaria o separador entrar; trip.financials é a permissão de
  // dinheiro que o operator tem e o separator não (authorization.policy.ts, ADR-0049 §6)
  'extra-charges': ['billing.create', 'trip.financials'],
  // useOccurrenceReimbursements.hook.ts:54
  reimbursements: ['trip.financials'],
  // FinancialResultsWorkspace.page.tsx:27
  'trip-financials': ['trip.financials'],
  // me-trip.routes.ts:109 (API) — a página do motorista não tem parede; spec 221 RF-E6
  'driver-trip': ['trip.report'],
}

describe('mapa de permissão por workspace — cobertura', () => {
  test('toda chave do menu tem entrada, exceto a notificação (porta é o sino)', () => {
    const missing = WORKSPACE_NAVIGATION_ITEMS.map(({ key }) => key)
      .filter((key) => key !== 'notification')
      .filter((key) => !(key in WORKSPACE_PERMISSIONS))

    expect(missing).toEqual([])
  })

  test('toda chave de grupo tem entrada no mapa', () => {
    const grouped = NAVIGATION_GROUPS.flatMap((group) => group.items.map(({ key }) => key))

    expect(grouped.filter((key) => !(key in WORKSPACE_PERMISSIONS))).toEqual([])
  })

  test('a notificação fica fora do mapa', () => {
    expect('notification' in WORKSPACE_PERMISSIONS).toBe(false)
  })

  test('o mapa não tem entrada para chave que o menu não conhece', () => {
    const known = new Set<string>(WORKSPACE_NAVIGATION_ITEMS.map(({ key }) => key))

    expect(Object.keys(WORKSPACE_PERMISSIONS).filter((key) => !known.has(key))).toEqual([])
  })

  test('nenhuma entrada fica vazia — workspace sem permissão abriria para todos', () => {
    for (const [key, permissions] of Object.entries(WORKSPACE_PERMISSIONS)) {
      expect({ key, hasPermission: permissions.length > 0 }).toEqual({ key, hasPermission: true })
    }
  })
})

describe('mapa de permissão por workspace — a tabela da RF-A3, entrada por entrada', () => {
  for (const [key, expected] of Object.entries(EXPECTED_WORKSPACE_PERMISSIONS)) {
    test(`${key} abre com ${expected.join(' ou ')}`, () => {
      const declared = (WORKSPACE_PERMISSIONS as Readonly<Record<string, readonly string[]>>)[key]

      expect([...(declared ?? [])].sort()).toEqual([...expected].sort())
    })
  }

  test('a tabela cobre exatamente as chaves do mapa', () => {
    expect(Object.keys(EXPECTED_WORKSPACE_PERMISSIONS).sort()).toEqual(
      Object.keys(WORKSPACE_PERMISSIONS).sort(),
    )
  })
})

describe('canOpenWorkspace — "qualquer uma de" é união', () => {
  test('Viagens abre com fleet.read sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['fleet.read'], workspace: 'trip' })).toBe(true)
  })

  test('Viagens abre com trip.report-on-behalf sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['trip.report-on-behalf'], workspace: 'trip' })).toBe(
      true,
    )
  })

  test('CT-e abre com cte.manage ou com cte.submit, cada uma sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['cte.manage'], workspace: 'cte-batch' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['cte.submit'], workspace: 'cte-batch' })).toBe(true)
  })

  test('NF-e abre com invoices.read ou com invoices.import, cada uma sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['invoices.read'], workspace: 'nfe' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['invoices.import'], workspace: 'nfe' })).toBe(true)
  })

  test('NFS-e abre com nfse.read ou com settings.manage (a aba de configuração), cada uma sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['nfse.read'], workspace: 'nfse-invoice' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['settings.manage'], workspace: 'nfse-invoice' })).toBe(
      true,
    )
    expect(canOpenWorkspace({ permissions: ['nfse.issue'], workspace: 'nfse-invoice' })).toBe(false)
  })

  test('Frete abre com settings.manage ou com freight.simulate, cada uma sozinha', () => {
    expect(canOpenWorkspace({ permissions: ['settings.manage'], workspace: 'freight' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['freight.simulate'], workspace: 'freight' })).toBe(true)
  })

  test('permissão que não pertence ao conjunto não abre', () => {
    expect(canOpenWorkspace({ permissions: ['cte.read'], workspace: 'cte-batch' })).toBe(false)
    expect(canOpenWorkspace({ permissions: ['trip.read'], workspace: 'trip' })).toBe(false)
  })

  test('conjunto vazio não abre nenhum workspace', () => {
    for (const { key } of WORKSPACE_NAVIGATION_ITEMS) {
      if (key === 'notification') continue
      expect(canOpenWorkspace({ permissions: [], workspace: key })).toBe(false)
    }
  })

  test('Repasses não abre para quem só tem trip.manage (o separador)', () => {
    expect(canOpenWorkspace({ permissions: ['trip.manage'], workspace: 'extra-charges' })).toBe(
      false,
    )
  })
})

describe('visibleWorkspaceKeys', () => {
  test('devolve vazio para conjunto vazio', () => {
    expect(visibleWorkspaceKeys([])).toEqual([])
  })

  test('segue a ordem de WORKSPACE_NAVIGATION_ITEMS, não a das permissões', () => {
    const keys = visibleWorkspaceKeys(['fleet.read', 'invoices.read'])

    expect(keys).toEqual(['nfe', 'trip', 'trip-occurrences', 'fleet', 'pendencias'])
  })

  test('não repete chave quando duas permissões abrem o mesmo workspace', () => {
    const keys = visibleWorkspaceKeys(['cte.manage', 'cte.submit'])

    expect(keys).toEqual(['cte-batch'])
  })
})
