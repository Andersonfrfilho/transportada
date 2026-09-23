/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  COMPANY_SETTINGS_TAB_PARAMETER,
  type CompanySettingsTabId,
} from './companySettingsTabs.service'

export const COMPANY_SETTINGS_ROUTE = '/company-settings'
export const COMPANY_SETTINGS_WORKSPACE = 'company-settings'

export function buildCompanySettingsRoute(tab: CompanySettingsTabId): string {
  const query = new URLSearchParams({ [COMPANY_SETTINGS_TAB_PARAMETER]: tab })
  return `${COMPANY_SETTINGS_ROUTE}?${query.toString()}`
}

/** A navegação do shell é manual: sem o `popstate` a troca de rota não chega ao `main.tsx`. */
export function navigateToCompanySettings(
  input: Readonly<{ navigator: WorkspaceNavigator; tab: CompanySettingsTabId }>,
): void {
  input.navigator.pushPath(buildCompanySettingsRoute(input.tab))
  input.navigator.rememberWorkspace(COMPANY_SETTINGS_WORKSPACE)
  input.navigator.dispatchPopState()
}
