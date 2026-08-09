/* Copyright (c) 2026 Ada Technology. MIT License. */
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
