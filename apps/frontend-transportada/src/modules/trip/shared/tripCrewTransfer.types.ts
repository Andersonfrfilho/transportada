/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDetail } from './trip.types'

/** Spec 249: `POST /trips/:id/crew-transfers`. Dinheiro trafega como string decimal, nunca número. */
export type CrewTransfer = Readonly<{
  costAfter: string
  costBefore: string
  costDifference: string
  costHasGaps: boolean
  id: string
  mdfeDriverDivergence: boolean
}>

export type CrewTransferResult = Readonly<{
  transfer: CrewTransfer
  trip: TripDetail
}>

/** O corpo nunca leva `vehicleId`: o caminhão fica travado na viagem em curso (spec 249 D2). */
export type TransferTripCrewInput = Readonly<{
  driverIds: readonly string[]
  helperIds: readonly string[]
  reason: string
  tripId: string
}>

export type CrewTransferMemberRole = 'driver' | 'helper'

export type CrewTransferMember = Readonly<{
  id: string
  name: string
  role: CrewTransferMemberRole
}>
