/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

export const DELIVERY_CLIENT_SEARCH_PARAMETER = 'name'
const DELIVERY_CLIENTS_ROUTE = '/clientes'
const DELIVERY_CLIENTS_WORKSPACE = 'delivery-clients'

export function buildDeliveryClientSearchRoute(clientName: string): string {
  const parameters = new URLSearchParams({ [DELIVERY_CLIENT_SEARCH_PARAMETER]: clientName })
  return `${DELIVERY_CLIENTS_ROUTE}?${parameters.toString()}`
}

export function readDeliveryClientSearchFromLocation(): string {
  return new URLSearchParams(window.location.search).get(DELIVERY_CLIENT_SEARCH_PARAMETER) ?? ''
}

export function navigateToDeliveryClientSearch(
  input: Readonly<{ clientName: string; navigator: WorkspaceNavigator }>,
): void {
  input.navigator.pushPath(buildDeliveryClientSearchRoute(input.clientName))
  input.navigator.rememberWorkspace(DELIVERY_CLIENTS_WORKSPACE)
  input.navigator.dispatchPopState()
}
