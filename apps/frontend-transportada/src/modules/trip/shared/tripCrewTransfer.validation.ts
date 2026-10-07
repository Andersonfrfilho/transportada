/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_ERROR } from './trip.constant'
import type { CrewTransfer } from './tripCrewTransfer.types'
import { hasExactKeys, isBoolean, isString } from './tripGuards.validation'

const CREW_TRANSFER_KEYS = [
  'costAfter',
  'costBefore',
  'costDifference',
  'costHasGaps',
  'id',
  'mdfeDriverDivergence',
] as const

const DECIMAL_STRING_PATTERN = /^-?\d+(?:\.\d+)?$/

function isDecimalString(value: unknown): value is string {
  return isString(value) && DECIMAL_STRING_PATTERN.test(value)
}

/** Dinheiro que chega como número ou com vírgula é resposta trocada: recusar é o que protege a conta. */
export function parseCrewTransfer(value: unknown): CrewTransfer {
  if (
    !hasExactKeys(value, CREW_TRANSFER_KEYS) ||
    !isString(value.id) ||
    !isDecimalString(value.costBefore) ||
    !isDecimalString(value.costAfter) ||
    !isDecimalString(value.costDifference) ||
    !isBoolean(value.costHasGaps) ||
    !isBoolean(value.mdfeDriverDivergence)
  ) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    costAfter: value.costAfter,
    costBefore: value.costBefore,
    costDifference: value.costDifference,
    costHasGaps: value.costHasGaps,
    id: value.id,
    mdfeDriverDivergence: value.mdfeDriverDivergence,
  }
}
