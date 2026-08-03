/* Copyright (c) 2026 Ada Technology. MIT License. */
import { SETTINGS_MANAGE_PERMISSION } from '@/modules/cte-profiles/shared/cteProfiles.constant'
import {
  createBrowserWorkspaceNavigator,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

export const CTE_PROFILES_ROUTE = '/cte-profiles'
export const CTE_PROFILES_WORKSPACE = 'cte-profiles'

export { createBrowserWorkspaceNavigator, WORKSPACE_STORAGE_KEY }
export type { WorkspaceNavigator }

export function canReachCteProfiles(permissions: readonly string[]): boolean {
  return permissions.includes(SETTINGS_MANAGE_PERMISSION)
}

/** A navegação do shell é manual: sem o `popstate` a troca de rota não chega ao `main.tsx`. */
export function navigateToCteProfiles(navigator: WorkspaceNavigator): void {
  navigator.pushPath(CTE_PROFILES_ROUTE)
  navigator.rememberWorkspace(CTE_PROFILES_WORKSPACE)
  navigator.dispatchPopState()
}
