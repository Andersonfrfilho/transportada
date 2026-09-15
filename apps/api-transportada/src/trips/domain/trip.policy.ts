/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriverStatus,
  FleetVehicleRole,
  FleetVehicleStatus,
} from '../../database/fleet.schema.js'
import type { TripCrewRole } from '../../shared/trip-crew-role.constant.js'
import {
  TripCrewHelperNotEligibleError,
  TripCrewHelperWithoutDriverError,
  TripDocumentReferenceInvalidError,
  TripDriverDuplicatedError,
  TripDriverNotAvailableError,
  TripDriverNotFoundError,
  TripVehicleNotAvailableError,
  TripVehicleNotFoundError,
} from './trip.error.js'

export type TripVehicleCandidate = {
  readonly id: string
  readonly role: FleetVehicleRole
  readonly status: FleetVehicleStatus
}

export type TripDriverCandidate = {
  /** Spec 149 (ADR-0065 D1): a ficha marca quem pode entrar na tripulação como ajudante. */
  readonly canActAsHelper: boolean
  readonly id: string
  readonly name: string
  readonly status: FleetDriverStatus
  readonly taxId: string
}

export type TripDriverLine = {
  readonly driverId: string
  readonly driverName: string
  readonly driverTaxId: string
  readonly position: number
  /** Spec 149 (ADR-0065): `driver` conduz e entra no MDF-e; `helper` é tripulação, não condutor. */
  readonly role: TripCrewRole
}

/**
 * Regra pura (ADR-0023): extraída de `resolveManifestVehicle` (mdfe-manifest-crew.service.ts) —
 * a viagem exige o mesmo veículo de tração ativo que o manifesto exigia. A busca do veículo é
 * responsabilidade da camada de aplicação (T006); esta função só decide.
 */
export function resolveTripVehicle(input: {
  readonly vehicle: TripVehicleCandidate | null
}): TripVehicleCandidate {
  const { vehicle } = input
  if (vehicle === null) throw new TripVehicleNotFoundError()
  if (vehicle.role !== 'traction' || vehicle.status !== 'active') {
    throw new TripVehicleNotAvailableError()
  }
  return vehicle
}

/**
 * Regra pura (ADR-0023, estendida pela spec 149 / ADR-0065): extraída de `resolveManifestCrew`
 * (mdfe-manifest-crew.service.ts) — a ordem pedida vira a posição na viagem, o primeiro motorista é
 * o principal. Ajudantes (D1/D5/D11) entram depois, na ordem pedida — a posição 1 é sempre um
 * `driver` (espelha `trip_drivers_lead_role_check` no banco). A busca dos condutores é
 * responsabilidade da camada de aplicação (T006/T3); esta função só decide.
 */
export function resolveTripCrew(input: {
  readonly driverIds: readonly string[]
  readonly helperIds?: readonly string[]
  readonly drivers: readonly TripDriverCandidate[]
}): readonly TripDriverLine[] {
  const { driverIds, drivers } = input
  const helperIds = input.helperIds ?? []
  const allIds = [...driverIds, ...helperIds]
  if (new Set(allIds).size !== allIds.length) {
    throw new TripDriverDuplicatedError()
  }
  if (driverIds.length === 0 && helperIds.length > 0) {
    throw new TripCrewHelperWithoutDriverError()
  }

  const driverById = new Map(drivers.map((driver) => [driver.id, driver]))

  const driverLines = driverIds.map((driverId, index) =>
    resolveCrewLine({ driverById, driverId, position: index + 1, role: 'driver' }),
  )

  const ineligibleHelperIds: string[] = []
  const helperLines = helperIds.map((driverId, index) => {
    const candidate = driverById.get(driverId)
    const line = resolveCrewLine({
      driverById,
      driverId,
      position: driverIds.length + index + 1,
      role: 'helper',
    })
    if (candidate !== undefined && !candidate.canActAsHelper) {
      ineligibleHelperIds.push(driverId)
    }
    return line
  })

  if (ineligibleHelperIds.length > 0) {
    throw new TripCrewHelperNotEligibleError(ineligibleHelperIds)
  }

  return [...driverLines, ...helperLines]
}

function resolveCrewLine(input: {
  readonly driverById: ReadonlyMap<string, TripDriverCandidate>
  readonly driverId: string
  readonly position: number
  readonly role: TripCrewRole
}): TripDriverLine {
  const driver = input.driverById.get(input.driverId)
  if (driver === undefined) throw new TripDriverNotFoundError()
  if (driver.status !== 'active') throw new TripDriverNotAvailableError()
  return {
    driverId: input.driverId,
    driverName: driver.name,
    driverTaxId: driver.taxId,
    position: input.position,
    role: input.role,
  }
}

/**
 * ADR-0065 §2: quem lê `trip_drivers` querendo "quem dirige" filtra o papel — este é o helper claro
 * para não duplicar `.filter((member) => member.role === 'driver')` em cada leitor (MDF-e, custo do
 * motorista, resumo financeiro). Estes leitores continuam fora do escopo desta task (T4/T6).
 */
export function driversOnly(crew: readonly TripDriverLine[]): readonly TripDriverLine[] {
  return crew.filter((member) => member.role === 'driver')
}

/**
 * Espelha `trip_documents_entity_xor_check` do banco (defesa em profundidade, ADR-0023 §2): a
 * viagem vincula a nota crua ou o frete já calculado sobre ela, nunca os dois nem nenhum.
 */
export function assertTripDocumentReference(input: {
  readonly freightCalculationId: string | null
  readonly nfeDocumentId: string | null
}): void {
  const hasNfeDocument = input.nfeDocumentId !== null
  const hasFreightCalculation = input.freightCalculationId !== null
  if (hasNfeDocument === hasFreightCalculation) {
    throw new TripDocumentReferenceInvalidError()
  }
}
