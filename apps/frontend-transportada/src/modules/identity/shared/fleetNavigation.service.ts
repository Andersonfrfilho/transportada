/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  buildFleetDriverRoute,
  buildFleetVehicleRoute,
} from '@/modules/fleet/shared/fleetRoute.service'
import {
  createBrowserWorkspaceNavigator,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

export const FLEET_WORKSPACE = 'fleet'

export { createBrowserWorkspaceNavigator }
export type { WorkspaceNavigator }

/**
 * A tela de usuários mostra que alguém é Motorista e, até agora, era um beco: não havia caminho para
 * a ficha dele. Estes dois levam — e vão pelo mesmo caminho do resto do shell, cuja navegação é
 * manual (`main.tsx`) e só reage a `popstate`.
 */
export function navigateToFleetDriver(
  input: Readonly<{ driverId: string; navigator: WorkspaceNavigator }>,
): void {
  input.navigator.pushPath(buildFleetDriverRoute(input.driverId))
  input.navigator.rememberWorkspace(FLEET_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToFleetVehicle(
  input: Readonly<{ navigator: WorkspaceNavigator; vehicleId: string }>,
): void {
  input.navigator.pushPath(buildFleetVehicleRoute(input.vehicleId))
  input.navigator.rememberWorkspace(FLEET_WORKSPACE)
  input.navigator.dispatchPopState()
}
