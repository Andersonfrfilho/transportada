/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  TRIP_TIMELINE_CREW_MEMBER_KEYS,
  TRIP_TIMELINE_CREW_TRANSFER_ALLOWED_KEYS,
  TRIP_TIMELINE_CREW_TRANSFER_REQUIRED_KEYS,
} from './trip.constant'
import { TRIP_TIMELINE_CREW_ROLES, type TripTimelineCrewMember } from './trip.types'
import { isDecimalString } from './tripCrewTransfer.validation'
import {
  hasExactKeys,
  hasKeys,
  isBoolean,
  isEveryItem,
  isOneOf,
  isString,
  isUnsignedInteger,
} from './tripGuards.validation'

function isCrewMember(value: unknown): value is TripTimelineCrewMember {
  return (
    hasExactKeys(value, TRIP_TIMELINE_CREW_MEMBER_KEYS) &&
    isString(value.driverId) &&
    isString(value.name) &&
    isUnsignedInteger(value.position) &&
    isOneOf(value.role, TRIP_TIMELINE_CREW_ROLES)
  )
}

function isCrewTransfer(value: unknown): boolean {
  if (
    !hasKeys(value, {
      allowed: TRIP_TIMELINE_CREW_TRANSFER_ALLOWED_KEYS,
      required: TRIP_TIMELINE_CREW_TRANSFER_REQUIRED_KEYS,
    })
  ) {
    return false
  }
  return (
    (value.costDifference === undefined || isDecimalString(value.costDifference)) &&
    isBoolean(value.mdfeDriverDivergence) &&
    isEveryItem(value.nextCrew, isCrewMember) &&
    isEveryItem(value.previousCrew, isCrewMember) &&
    isString(value.reason)
  )
}

/** Spec 249 D6: o `crewTransfer` é do item da transferência e de mais nenhum; nele, é obrigatório. */
export function hasCrewTransferForKind(value: Readonly<Record<string, unknown>>): boolean {
  if (value.kind !== 'crew_transfer') return value.crewTransfer === undefined
  return isCrewTransfer(value.crewTransfer)
}
