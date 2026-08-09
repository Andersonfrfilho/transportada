/* Copyright (c) 2026 Ada Technology. MIT License. */
import { SETTINGS_MANAGE_PERMISSION } from '@/modules/cte-profiles/shared/cteProfiles.constant'
import {
  createBrowserWorkspaceNavigator,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

export const COMPANY_SETTINGS_ROUTE = '/company-settings'
export const COMPANY_SETTINGS_WORKSPACE = 'company-settings'

export { createBrowserWorkspaceNavigator, WORKSPACE_STORAGE_KEY }
export type { WorkspaceNavigator }

export function canReachCompanySettings(permissions: readonly string[]): boolean {
  return permissions.includes(SETTINGS_MANAGE_PERMISSION)
}

/** A navegação do shell é manual: sem o `popstate` a troca de rota não chega ao `main.tsx`. */
export function navigateToCompanySettings(navigator: WorkspaceNavigator): void {
  navigator.pushPath(COMPANY_SETTINGS_ROUTE)
  navigator.rememberWorkspace(COMPANY_SETTINGS_WORKSPACE)
  navigator.dispatchPopState()
}
