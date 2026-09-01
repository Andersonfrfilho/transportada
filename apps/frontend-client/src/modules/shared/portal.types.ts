/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O payload mínimo da API (ADR-0050 §4). O portal não conhece id de nota, de viagem nem de parada. */
export type Delivery = Readonly<{
  accessKey: string
  deliveredAt: string | null
  estimatedArrivalAt: string | null
  issuedAt: string
  number: string
  returnReason: string | null
  separationStatus: string | null
  series: string
  tripStatus: string | null
}>

export type DeliveryLocation = Readonly<{
  latitude: string
  longitude: string
  recordedAt: string
}>

export type DeliverySchedule = Readonly<{
  divergedAt: string | null
  notes: string
  protocol: string
  scheduledAt: string | null
  status: string
}>

export type ScheduleInput = Readonly<{
  accessKey: string
  notes?: string
  protocol?: string
  scheduledAt: string | null
  status: 'confirmed' | 'refused'
}>

export type ChargeBatchItem = Readonly<{
  amount: string
  chargeType: string
  chargedOn: string
  clientName: string
  id: string
  notes: string
  rejectionReason: string
  status: string
}>

export type ChargeBatch = Readonly<{
  batch: Readonly<{
    closedAt: string
    id: string
    periodEnd: string
    periodStart: string
    status: string
    totalAmount: string
  }>
  items: readonly ChargeBatchItem[]
  itemsTotal: string
}>

export type ChargeDecision = Readonly<{
  chargeId: string
  decision: 'approved' | 'rejected'
  reason: string
}>
