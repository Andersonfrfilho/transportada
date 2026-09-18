/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'

export type RecordTripStatusChangeParams = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly fromStatus: TripStatus
  /** ADR-0068 §1: quando a transição aconteceu. Ausente cai no `defaultNow()` do banco. */
  readonly occurredAt?: Date
  /** ADR-0068 §3: só quando `channel = 'office'`. */
  readonly onBehalfOfDriverId: string | null
  readonly toStatus: TripStatus
  readonly tripId: string
}
