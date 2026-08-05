/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_READ = 'fleet.read'
export const FLEET_MANAGE = 'fleet.manage'

export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-28T12:00:00.000Z::00000000-0000-4000-8000-000000000a11'

export const TRIP_ID = '00000000-0000-4000-8000-000000000a11'
export const SECOND_TRIP_ID = '00000000-0000-4000-8000-000000000a12'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000c01'
export const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000c02'

export type TripContract = Readonly<{
  companyId: string
  createdAt: string
  id: string
  status: 'closed' | 'open'
  updatedAt: string
  vehicleId: string
}>

export type TripDocumentContract = Readonly<{
  createdAt: string
  deliveredAt: null | string
  freightCalculationId: null | string
  id: string
  nfeDocumentId: null | string
  releasedAt: null | string
  tripId: string
  updatedAt: string
}>

export type TripDocumentDetailContract = TripDocumentContract &
  Readonly<{ cteAuthorized: boolean; fiscalStatus: string }>

export type TripDetailContract = TripContract &
  Readonly<{
    documents: readonly TripDocumentDetailContract[]
    drivers: readonly Readonly<{
      driverId: string
      driverName: string
      driverTaxId: string
      position: number
    }>[]
  }>

export const TRIP = {
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-28T12:00:00.000Z',
  id: TRIP_ID,
  status: 'open',
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const satisfies TripContract

export const SECOND_TRIP = {
  ...TRIP,
  createdAt: '2026-07-27T09:30:00.000Z',
  id: SECOND_TRIP_ID,
  status: 'closed',
  updatedAt: '2026-07-27T10:00:00.000Z',
} as const satisfies TripContract

export const TRIP_DOCUMENT = {
  createdAt: '2026-07-28T12:05:00.000Z',
  deliveredAt: null,
  freightCalculationId: null,
  id: DOCUMENT_ID,
  nfeDocumentId: NFE_DOCUMENT_ID,
  releasedAt: null,
  tripId: TRIP_ID,
  updatedAt: '2026-07-28T12:05:00.000Z',
} as const satisfies TripDocumentContract

export const TRIP_DOCUMENT_DETAIL = {
  ...TRIP_DOCUMENT,
  cteAuthorized: true,
  fiscalStatus: 'authorized',
} as const satisfies TripDocumentDetailContract

export const TRIP_DETAIL = {
  ...TRIP,
  documents: [TRIP_DOCUMENT_DETAIL],
  drivers: [{ driverId: DRIVER_ID, driverName: 'Jose da Silva', driverTaxId: '12345678901', position: 1 }],
} as const satisfies TripDetailContract

export const TRIP_PAGE = {
  items: [TRIP, SECOND_TRIP],
  nextCursor: SYNTHETIC_CURSOR,
} as const

export const CREATE_TRIP_BODY = {
  driverIds: [DRIVER_ID],
  vehicleId: VEHICLE_ID,
} as const

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
