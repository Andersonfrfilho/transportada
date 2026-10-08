/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE } from './trip.constant'
import type { TripDocumentDeliveryDeadline } from './trip.types'
import { hasExactKeys, isRecord, isUnsignedInteger } from './tripGuards.validation'

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DELIVERY_DEADLINE_KEY = 'deliveryDeadline'
const DELIVERY_DEADLINE_STATES: readonly string[] = Object.keys(
  TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE,
)

/** Data civil `YYYY-MM-DD` que existe no calendário: `2026-02-30` não passa. */
function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CIVIL_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isDeliveryDeadlineState(
  value: unknown,
): value is keyof typeof TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE {
  return typeof value === 'string' && DELIVERY_DEADLINE_STATES.includes(value)
}

/** Chaves exatas por estado: a tela de cada selo lê só o que o estado promete. */
export function isDeliveryDeadline(value: unknown): value is TripDocumentDeliveryDeadline {
  if (!isRecord(value) || !isDeliveryDeadlineState(value.state)) return false
  if (!hasExactKeys(value, TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE[value.state])) return false
  return (
    isCivilDate(value.dueOn) &&
    (value.deliveredOn === undefined || isCivilDate(value.deliveredOn)) &&
    (value.businessDaysLate === undefined || isUnsignedInteger(value.businessDaysLate)) &&
    (value.businessDaysRemaining === undefined || isUnsignedInteger(value.businessDaysRemaining))
  )
}

export function isAbsentOrDeliveryDeadline(value: unknown): boolean {
  return value === undefined || value === null || isDeliveryDeadline(value)
}

/**
 * O leitor tolerante cai para só os obrigatórios quando QUALQUER opcional vem fora da forma, e levaria
 * `contact`, `proofPending` e os outros junto. O prazo é refinamento: malformado sai sozinho, antes.
 */
export function dropMalformedDeliveryDeadline(value: unknown): unknown {
  if (!isRecord(value) || isAbsentOrDeliveryDeadline(value[DELIVERY_DEADLINE_KEY])) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== DELIVERY_DEADLINE_KEY))
}
