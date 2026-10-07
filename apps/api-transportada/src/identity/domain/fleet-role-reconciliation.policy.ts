/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import { FleetDriverProfileEmptyError } from '../../fleet/domain/fleet.error.js'

/** As duas colunas da ficha de frota que a política de viagem lê (spec 235 D2). */
export type FleetCrewCapabilities = {
  readonly canActAsHelper: boolean
  readonly canDrive: boolean
}

export type ReconcileFleetCrewCapabilitiesParams = {
  readonly current: FleetCrewCapabilities
  readonly nextRoles: readonly CompanyRole[]
  readonly previousRoles: readonly CompanyRole[]
}

export type ReconcileFleetCrewCapabilitiesResult =
  | { readonly kind: 'unchanged' }
  | { readonly capabilities: FleetCrewCapabilities; readonly kind: 'changed' }

const DRIVING_ROLES: readonly CompanyRole[] = ['driver', 'aggregate']
const HELPER_ROLE: CompanyRole = 'helper'

/**
 * Spec 235 D4: cada coluna só muda pela entrada ou saída do papel que lhe corresponde, então o switch
 * "Pode atuar como ajudante" de um motorista sobrevive a uma troca que não toca `helper`.
 */
export function reconcileFleetCrewCapabilities({
  current,
  nextRoles,
  previousRoles,
}: ReconcileFleetCrewCapabilitiesParams): ReconcileFleetCrewCapabilitiesResult {
  const canDrive = resolveCapability({
    current: current.canDrive,
    isGranted: (roles) => roles.some((role) => DRIVING_ROLES.includes(role)),
    nextRoles,
    previousRoles,
  })
  const canActAsHelper = resolveCapability({
    current: current.canActAsHelper,
    isGranted: (roles) => roles.includes(HELPER_ROLE),
    nextRoles,
    previousRoles,
  })

  if (canDrive === current.canDrive && canActAsHelper === current.canActAsHelper) {
    return { kind: 'unchanged' }
  }
  if (!canDrive && !canActAsHelper) throw new FleetDriverProfileEmptyError()
  return { capabilities: { canActAsHelper, canDrive }, kind: 'changed' }
}

/**
 * Spec 235 D2 no convite: a ficha órfã que o convite vincula ganha as colunas do perfil quando o papel
 * é `helper` — só ajuda se não houver papel de quem dirige. Convite sem `helper` mantém o comportamento
 * de sempre e não toca as colunas.
 */
export function resolveInvitedFleetCrewCapabilities(params: {
  readonly current: FleetCrewCapabilities
  readonly roles: readonly CompanyRole[]
}): ReconcileFleetCrewCapabilitiesResult {
  if (!params.roles.includes(HELPER_ROLE)) return { kind: 'unchanged' }
  const capabilities = {
    canActAsHelper: true,
    canDrive: params.roles.some((role) => DRIVING_ROLES.includes(role)),
  }
  if (
    capabilities.canDrive === params.current.canDrive &&
    capabilities.canActAsHelper === params.current.canActAsHelper
  ) {
    return { kind: 'unchanged' }
  }
  return { capabilities, kind: 'changed' }
}

function resolveCapability(input: {
  readonly current: boolean
  readonly isGranted: (roles: readonly CompanyRole[]) => boolean
  readonly nextRoles: readonly CompanyRole[]
  readonly previousRoles: readonly CompanyRole[]
}): boolean {
  const wasGranted = input.isGranted(input.previousRoles)
  const isGranted = input.isGranted(input.nextRoles)
  if (wasGranted === isGranted) return input.current
  return isGranted
}
