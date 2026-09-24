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

/**
 * Spec 171 RF1: o nascimento da viagem, pelo mesmo caminho das demais transições —
 * `trip_status_events`, na mesma transação do `INSERT trips`. `actor_user_id` continua `not null`
 * (fora do escopo desta spec: hoje só `POST /trips` autenticado cria viagem — nenhuma semeadura ou
 * importação passa por aqui ainda).
 */
export type RecordTripCreationParams = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  /** O estado inicial da viagem (`trips.status` no `INSERT`) — grava em `fromStatus` e `toStatus`. */
  readonly status: TripStatus
  readonly tripId: string
}
