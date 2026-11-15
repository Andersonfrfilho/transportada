/* Copyright (c) 2026 Ada Technology. MIT License. */
export const PICKUP_MANAGE_PERMISSION = 'pickup.manage'

export type PickupRequestStatus =
  | 'accepted'
  | 'canceled'
  | 'done'
  | 'expired'
  | 'refused'
  | 'requested'
  | 'scheduled'

export const PICKUP_REQUEST_STATUSES: readonly PickupRequestStatus[] = [
  'requested',
  'accepted',
  'scheduled',
  'refused',
  'canceled',
  'expired',
  'done',
]

export type PickupAddress = Readonly<{
  city: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type PickupRequestView = Readonly<{
  acceptedTotalAmount: string | null
  acceptedWindowEnd: string | null
  acceptedWindowStart: string | null
  cargoDescription: string
  createdAt: string
  decisionNote: string | null
  destination: PickupAddress
  expiresAt: string
  id: string
  kind: 'delivery' | 'pickup'
  note: string | null
  origin: PickupAddress
  quotedTotalAmount: string | null
  requesterEmail: string | null
  requesterName: string
  requesterPhone: string | null
  status: PickupRequestStatus
  tripId: string | null
  volumes: number
  weightKg: string
  windowEnd: string
  windowStart: string
}>

export type SuggestedTrip = Readonly<{
  createdAt: string
  id: string
  status: string
  stopCount: number
}>

export type PickupRequestDetail = Readonly<{
  request: PickupRequestView
  suggestion: Readonly<{ canCreateNewTrip: boolean; trips: readonly SuggestedTrip[] }> | null
}>

export type AcceptInput = Readonly<{
  acceptedTotalAmount: string | null
  acceptedWindowEnd: string | null
  acceptedWindowStart: string | null
  note: string | null
}>
