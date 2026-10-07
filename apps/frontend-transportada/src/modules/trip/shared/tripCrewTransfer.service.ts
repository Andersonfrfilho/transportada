/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  compareScaledAmounts,
  formatAmount,
  zeroAmount,
} from '@/modules/shared/decimalAmount.service'

import type { TripDetail } from './trip.types'
import type {
  CrewTransfer,
  CrewTransferMember,
  TransferTripCrewInput,
} from './tripCrewTransfer.types'

/** Spec 249 D3: o mesmo teto do `reason` da API (1 a 500 caracteres). */
export const CREW_TRANSFER_REASON_MAX_LENGTH = 500

export type CrewTransferBlocker =
  | 'crewUnchanged'
  | 'driverCannotDrive'
  | 'driverRequired'
  | 'helperIsDriver'
  | 'reasonRequired'
  | 'reasonTooLong'

export type CrewTransferDraft = Readonly<{
  currentDriverIds: readonly string[]
  currentHelperIds: readonly string[]
  driverIds: readonly string[]
  helperIds: readonly string[]
  reason: string
  selectableDriverIds: readonly string[]
}>

function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Spec 249 D3/D4/D5: o que a tela já sabe recusar antes de ir ao servidor — motivo, ao menos um
 * motorista, ninguém nos dois lugares, só quem dirige como motorista e uma troca de verdade. O
 * servidor repete cada regra; esta serve para o botão não oferecer o que ele recusaria.
 */
export function resolveCrewTransferBlocker(
  input: CrewTransferDraft,
): CrewTransferBlocker | undefined {
  const reasonLength = input.reason.trim().length
  if (reasonLength === 0) return 'reasonRequired'
  if (reasonLength > CREW_TRANSFER_REASON_MAX_LENGTH) return 'reasonTooLong'
  if (input.driverIds.length === 0) return 'driverRequired'
  if (input.driverIds.some((driverId) => input.helperIds.includes(driverId))) {
    return 'helperIsDriver'
  }
  const selectable = new Set(input.selectableDriverIds)
  if (input.driverIds.some((driverId) => !selectable.has(driverId))) return 'driverCannotDrive'
  const isUnchanged =
    isSameList(input.driverIds, input.currentDriverIds) &&
    isSameList(input.helperIds, input.currentHelperIds)
  return isUnchanged ? 'crewUnchanged' : undefined
}

export function buildTransferTripCrewInput(input: TransferTripCrewInput): TransferTripCrewInput {
  return {
    driverIds: input.driverIds,
    helperIds: input.helperIds,
    reason: input.reason.trim(),
    tripId: input.tripId,
  }
}

export const CREW_TRANSFER_ERROR_KEYS = [
  'unchanged',
  'notAllowed',
  'driverCannotDrive',
  'helperNotEligible',
  'helperWithoutDriver',
  'generic',
] as const
export type CrewTransferErrorKey = (typeof CREW_TRANSFER_ERROR_KEYS)[number]

const CREW_TRANSFER_ERROR_KEY_BY_CODE: Readonly<Record<string, CrewTransferErrorKey>> = {
  STATE_TRANSITION_NOT_ALLOWED: 'notAllowed',
  TRIP_CREW_HELPER_NOT_ELIGIBLE: 'helperNotEligible',
  TRIP_CREW_HELPER_WITHOUT_DRIVER: 'helperWithoutDriver',
  TRIP_CREW_UNCHANGED: 'unchanged',
  TRIP_DRIVER_CANNOT_DRIVE: 'driverCannotDrive',
}

/** O `code` do erro viaja em `error.message` (`tripClient.service.ts`) — nunca o texto de `details`. */
export function resolveCrewTransferErrorKey(error: unknown): CrewTransferErrorKey {
  if (!(error instanceof Error)) return 'generic'
  return CREW_TRANSFER_ERROR_KEY_BY_CODE[error.message] ?? 'generic'
}

export type CrewTransferOutcome = Readonly<{
  after: string
  before: string
  difference: string
  direction: 'decrease' | 'increase' | 'same'
  hasGaps: boolean
  hasMdfeDivergence: boolean
}>

/** Spec 249 RF4/RF5: o que a tela diz depois da troca — diferença de custo e o aviso do MDF-e. */
export function resolveCrewTransferOutcome(transfer: CrewTransfer): CrewTransferOutcome {
  const sign = compareScaledAmounts(transfer.costDifference, zeroAmount(2))
  return {
    after: formatAmount(transfer.costAfter),
    before: formatAmount(transfer.costBefore),
    difference: formatAmount(transfer.costDifference),
    direction: sign > 0 ? 'increase' : sign < 0 ? 'decrease' : 'same',
    hasGaps: transfer.costHasGaps,
    hasMdfeDivergence: transfer.mdfeDriverDivergence,
  }
}

function toMemberKey(member: CrewTransferMember): string {
  return `${member.role}:${member.id}`
}

function readCurrentMembers(trip: Pick<TripDetail, 'drivers'>): readonly CrewTransferMember[] {
  return trip.drivers.map((member) => ({
    id: member.driverId,
    name: member.driverName,
    role: member.role === 'helper' ? 'helper' : 'driver',
  }))
}

type SummarizeCrewChangeInput = Readonly<{
  drivers: readonly Readonly<{ id: string; name: string }>[]
  nextDriverIds: readonly string[]
  nextHelperIds: readonly string[]
  trip: Pick<TripDetail, 'drivers'>
}>

/** Spec 249 RF4: "quem sai → quem entra". Quem muda de papel sai de um e entra no outro. */
export function summarizeCrewChange(input: SummarizeCrewChangeInput): Readonly<{
  entering: readonly CrewTransferMember[]
  leaving: readonly CrewTransferMember[]
}> {
  const current = readCurrentMembers(input.trip)
  const nameById = new Map([
    ...current.map((member) => [member.id, member.name] as const),
    ...input.drivers.map((driver) => [driver.id, driver.name] as const),
  ])
  const next: readonly CrewTransferMember[] = [
    ...input.nextDriverIds.map((id) => ({
      id,
      name: nameById.get(id) ?? id,
      role: 'driver' as const,
    })),
    ...input.nextHelperIds.map((id) => ({
      id,
      name: nameById.get(id) ?? id,
      role: 'helper' as const,
    })),
  ]
  const currentKeys = new Set(current.map(toMemberKey))
  const nextKeys = new Set(next.map(toMemberKey))

  return {
    entering: next.filter((member) => !currentKeys.has(toMemberKey(member))),
    leaving: current.filter((member) => !nextKeys.has(toMemberKey(member))),
  }
}
