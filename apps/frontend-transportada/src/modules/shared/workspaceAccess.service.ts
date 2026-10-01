/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NAVIGATION_GROUPS,
  WORKSPACE_NAVIGATION_ITEMS,
  type NavigationGroup,
  type WorkspaceKey,
} from './workspaceNavigation.constant'

/** A notificação abre pelo sino do cabeçalho, nunca pelo menu: ela não tem porta para filtrar. */
type GatedWorkspaceKey = Exclude<WorkspaceKey, 'notification'>

/**
 * Spec 221 RF-A1/A3: a permissão de cada workspace, declarada uma vez. Cada lista é "qualquer uma
 * de". `satisfies` faz chave nova em `WORKSPACE_NAVIGATION_ITEMS` sem entrada reprovar o typecheck.
 * A origem verificada em 2026-10-01 está ao lado de cada linha; a página continua com a parede dela.
 */
export const WORKSPACE_PERMISSIONS = {
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
  // Intenção de produto: a API lê com trip.read (SECURITY.md:383); trip.manage abriria ao separador
  'extra-charges': ['billing.create', 'trip.financials'],
  // useOccurrenceReimbursements.hook.ts:54
  reimbursements: ['trip.financials'],
  // FinancialResultsWorkspace.page.tsx:27
  'trip-financials': ['trip.financials'],
  // me-trip.routes.ts:109 (API) — a página do motorista não tem parede
  'driver-trip': ['trip.report'],
} as const satisfies Record<GatedWorkspaceKey, readonly string[]>

function isGatedWorkspace(workspace: WorkspaceKey): workspace is GatedWorkspaceKey {
  return workspace in WORKSPACE_PERMISSIONS
}

export function canOpenWorkspace(
  input: Readonly<{ permissions: readonly string[]; workspace: WorkspaceKey }>,
): boolean {
  if (!isGatedWorkspace(input.workspace)) return false
  const accepted: readonly string[] = WORKSPACE_PERMISSIONS[input.workspace]
  return accepted.some((permission) => input.permissions.includes(permission))
}

export function visibleWorkspaceKeys(permissions: readonly string[]): readonly WorkspaceKey[] {
  return WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
    canOpenWorkspace({ permissions, workspace: key }),
  ).map(({ key }) => key)
}

export function resolveVisibleNavigationGroups(
  permissions: readonly string[],
): readonly NavigationGroup[] {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(({ key }) => canOpenWorkspace({ permissions, workspace: key })),
  })).filter((group) => group.items.length > 0)
}

export type NavigationMenuState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ groups: readonly NavigationGroup[]; kind: 'ready' }>

/** Sem permissões e sem falha o menu espera; com falha mostra menos, nunca mais (spec 221 D6). */
export function resolveNavigationMenu(
  input: Readonly<{ hasFailed: boolean; permissions: readonly string[] | undefined }>,
): NavigationMenuState {
  if (input.permissions === undefined) {
    return input.hasFailed ? { groups: [], kind: 'ready' } : { kind: 'loading' }
  }
  return { groups: resolveVisibleNavigationGroups(input.permissions), kind: 'ready' }
}
