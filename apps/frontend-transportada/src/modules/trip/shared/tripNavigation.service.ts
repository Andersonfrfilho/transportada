/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildFleetTollBoothRoute } from '@/modules/fleet/shared/fleetRoute.service'
import {
  buildMdfeManifestRoute,
  MDFE_MANIFEST_WORKSPACE,
  MDFE_MANIFESTS_ROUTE,
} from '@/modules/mdfe-manifest/shared/mdfeManifestRoute.service'
import {
  createBrowserWorkspaceNavigator,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

export const MDFE_MANIFEST_ROUTE = MDFE_MANIFESTS_ROUTE
export { MDFE_MANIFEST_WORKSPACE }
export const NFE_WORKSPACE_ROUTE = '/'
export const NFE_WORKSPACE = 'nfe'
/** Mesma chave que `@/modules/identity/shared/fleetNavigation.service.ts` já usa para a frota. */
export const FLEET_WORKSPACE = 'fleet'

export { createBrowserWorkspaceNavigator }
export type { WorkspaceNavigator }

/**
 * A navegação do shell é manual (`main.tsx`): sem o `popstate` a troca de rota não chega lá.
 * `nfe` nunca é gravado em `sessionStorage` por `persistWorkspacePreference`, mas gravar não quebra
 * `resolveCurrentWorkspace` — o valor só não bate em nenhum caso especial e cai no padrão `nfe`.
 * A viagem de origem vai na query string para o manifesto nascer com `trip_id` preenchido.
 */
export function navigateToMdfeManifests(
  input: Readonly<{ navigator: WorkspaceNavigator; tripId?: string }>,
): void {
  input.navigator.pushPath(buildMdfeManifestRoute(input.tripId))
  input.navigator.rememberWorkspace(MDFE_MANIFEST_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToNfeWorkspace(navigator: WorkspaceNavigator): void {
  navigator.pushPath(NFE_WORKSPACE_ROUTE)
  navigator.rememberWorkspace(NFE_WORKSPACE)
  navigator.dispatchPopState()
}

/** Spec 144 (D4): o atalho da lista do que falta medir cai direto na aba de caixas da 085. */
export function navigateToPackageBoxQueue(navigator: WorkspaceNavigator): void {
  navigator.pushPath(`${NFE_WORKSPACE_ROUTE}?tab=boxes`)
  navigator.rememberWorkspace(NFE_WORKSPACE)
  navigator.dispatchPopState()
}

/**
 * RF7 (spec 154): o termo que abre a praça certa na busca da aba de pedágio — o nome quando existe,
 * o operador no resto, e vazio só quando o extrato não conhece nenhum dos dois (a aba ainda abre,
 * sem praça pré-selecionada).
 */
export function resolveTollBoothAdjustmentSearch(
  booth: Readonly<{ name: null | string; operator: null | string }>,
): string {
  return booth.name ?? booth.operator ?? ''
}

/** RF7 (spec 154): leva a praça sem tarifa conhecida do extrato da rota até o ajuste dela em Frota. */
export function navigateToFleetTollBoothAdjustment(
  input: Readonly<{ navigator: WorkspaceNavigator; search: string }>,
): void {
  input.navigator.pushPath(buildFleetTollBoothRoute(input.search))
  input.navigator.rememberWorkspace(FLEET_WORKSPACE)
  input.navigator.dispatchPopState()
}
