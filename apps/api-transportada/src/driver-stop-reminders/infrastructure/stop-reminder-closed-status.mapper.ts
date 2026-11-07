/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DriverStopReminderClosedReason,
  DriverStopReminderStatus,
} from '../../shared/driver-stop-reminder.constant.js'

const CANCELLED_REASONS: ReadonlySet<DriverStopReminderClosedReason> = new Set([
  'superseded',
  'departure_cancelled',
  'trip_cancelled',
])

/** O que a cobrança cumpriu fecha como `closed`; o que deixou de valer (abandonada, desfeita, viagem cancelada) como `cancelled`. */
export function resolveStopReminderClosedStatus(
  reason: DriverStopReminderClosedReason,
): DriverStopReminderStatus {
  return CANCELLED_REASONS.has(reason) ? 'cancelled' : 'closed'
}
