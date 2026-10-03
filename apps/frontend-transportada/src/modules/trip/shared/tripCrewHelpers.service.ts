/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDetail } from './trip.types'

type HelperCandidate = Readonly<{ canActAsHelper: boolean; id: string; status: string }>
type DriverCandidate = Readonly<{ canDrive: boolean; id: string }>

/**
 * Spec 234 D5: motorista só entre quem dirige. O motorista **atual** da viagem fica na lista mesmo
 * que a ficha tenha deixado de dirigir depois: sem ele ali, não haveria como retirá-lo.
 */
export function listDriverCandidates<TDriver extends DriverCandidate>(
  input: Readonly<{ currentDriverIds: readonly string[]; drivers: readonly TDriver[] }>,
): readonly TDriver[] {
  const current = new Set(input.currentDriverIds)

  return input.drivers.filter((driver) => driver.canDrive || current.has(driver.id))
}

/**
 * Spec 149 D1/D11: ajudante é escolhido à mão, só entre as fichas marcadas "pode atuar como
 * ajudante", e quem já dirige nesta viagem não aparece de novo. O ajudante **atual** da viagem fica
 * na lista mesmo que a ficha tenha mudado depois: sem ele ali, não haveria como retirá-lo.
 */
export function listHelperCandidates<TDriver extends HelperCandidate>(
  input: Readonly<{
    currentHelperIds: readonly string[]
    driverIds: readonly string[]
    drivers: readonly TDriver[]
  }>,
): readonly TDriver[] {
  const driving = new Set(input.driverIds)
  const current = new Set(input.currentHelperIds)

  return input.drivers.filter((driver) => {
    if (driving.has(driver.id)) return false
    if (current.has(driver.id)) return true
    return driver.status === 'active' && driver.canActAsHelper
  })
}

/** Quem a viagem já tem como ajudante, na ordem da tripulação. Linha sem `role` é motorista (spec 078 D2). */
export function readTripHelperIds(trip: Pick<TripDetail, 'drivers'>): readonly string[] {
  return trip.drivers
    .filter((member) => member.role === 'helper')
    .sort((first, second) => first.position - second.position)
    .map((member) => member.driverId)
}

/** Quem a viagem já tem como motorista. Linha sem `role` é motorista (spec 078 D2). */
export function readTripDriverIds(trip: Pick<TripDetail, 'drivers'>): readonly string[] {
  return trip.drivers.filter((member) => member.role !== 'helper').map((member) => member.driverId)
}

/** A mesma pessoa não ocupa dois lugares (ADR-0065 §4): quem passa a dirigir deixa de ser ajudante. */
export function withoutSelectedDrivers(
  input: Readonly<{ driverIds: readonly string[]; helperIds: readonly string[] }>,
): readonly string[] {
  const driving = new Set(input.driverIds)
  return input.helperIds.filter((helperId) => !driving.has(helperId))
}
