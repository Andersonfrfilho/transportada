/* Copyright (c) 2026 Ada Technology. MIT License. */
export const TRIP_STATUS = ['open', 'closed'] as const
export type TripStatus = (typeof TRIP_STATUS)[number]

export type TripDriverLine = Readonly<{
  driverId: string
  driverName: string
  driverTaxId: string
  position: number
}>

export type Trip = Readonly<{
  companyId: string
  createdAt: string
  id: string
  status: TripStatus
  updatedAt: string
  vehicleId: string
}>

export type TripDocument = Readonly<{
  createdAt: string
  deliveredAt: null | string
  freightCalculationId: null | string
  id: string
  nfeDocumentId: null | string
  releasedAt: null | string
  tripId: string
  updatedAt: string
}>

export type TripDocumentDetail = TripDocument &
  Readonly<{ cteAuthorized: boolean; fiscalStatus: string }>

export type TripDetail = Trip &
  Readonly<{
    documents: readonly TripDocumentDetail[]
    drivers: readonly TripDriverLine[]
  }>

/** Sem `sortBy`/`sortDirection`: nenhuma rota real do backend implementa ordenação por servidor
 * (ver comentário de `TripFilters` em `trip.port.ts`) — ADR-0024 documenta a consequência no
 * frontend. */
export type TripFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  driverIdEq?: string
  statusEq?: TripStatus
  vehicleIdEq?: string
}>

export type TripPage = Readonly<{
  items: readonly Trip[]
  nextCursor: null | string
}>

export type TripListInput = Readonly<{
  cursor: null | string
  filters?: TripFilters
  limit: number
}>

export type CreateTripBody = Readonly<{
  driverIds: readonly string[]
  vehicleId: string
}>

export type LinkTripDocumentBody = Readonly<{
  freightCalculationId: null | string
  nfeDocumentId: null | string
}>

export type LinkTripDocumentInput = LinkTripDocumentBody & Readonly<{ tripId: string }>

export type TripDocumentActionInput = Readonly<{ documentId: string; tripId: string }>
