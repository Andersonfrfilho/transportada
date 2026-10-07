/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'

/**
 * O agregado costuma dirigir o veículo dele; o motorista dirige o próprio ou o da empresa; o
 * ajudante (spec 235) acompanha a viagem e não dirige. Os três são papéis do catálogo de identidade,
 * e o `satisfies` é o que impede o trio de sair dele.
 */
export const FLEET_DRIVER_PROFILES = [
  'aggregate',
  'driver',
  'helper',
] as const satisfies readonly CompanyRole[]

export type FleetDriverProfile = (typeof FLEET_DRIVER_PROFILES)[number]
