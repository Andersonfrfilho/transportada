/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_READ = 'fleet.read'
export const FLEET_MANAGE = 'fleet.manage'
export const TRIP_MANAGE = 'trip.manage'

export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-28T12:00:00.000Z::00000000-0000-4000-8000-000000000a11'

export const TRIP_ID = '00000000-0000-4000-8000-000000000a11'
export const SECOND_TRIP_ID = '00000000-0000-4000-8000-000000000a12'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000c01'
export const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000c02'

export type TripStatusContract =
  | 'cancelled'
  | 'completed'
  | 'dispatched'
  | 'draft'
  | 'in_transit'
  | 'loading'
  | 'route_planned'
  | 'separating'

export type TripContract = Readonly<{
  companyId: string
  createdAt: string
  id: string
  status: TripStatusContract
  updatedAt: string
  vehicleId: string
}>

export type TripDocumentContract = Readonly<{
  createdAt: string
  deliveredAt: null | string
  freightCalculationId: null | string
  id: string
  loadedAt: null | string
  nfeDocumentId: null | string
  releasedAt: null | string
  returnedAt: null | string
  returnReason: null | string
  separatedAt: null | string
  separationStatus: 'delivered' | 'loaded' | 'pending' | 'returned' | 'separated'
  stopId: null | string
  tripId: string
  updatedAt: string
}>

export type TripDocumentDetailContract = TripDocumentContract &
  Readonly<{ cteAuthorized: boolean; fiscalStatus: string }>

export type TripStopDetailContract = Readonly<{
  addressKey: string
  arrivedAt: null | string
  completedAt: null | string
  deliveryWindowEnd: null | string
  deliveryWindowStart: null | string
  documents: readonly TripDocumentDetailContract[]
  id: string
  label: string
  sequence: number
}>

export type TripDetailContract = TripContract &
  Readonly<{
    documents: readonly TripDocumentDetailContract[]
    drivers: readonly Readonly<{
      driverId: string
      driverName: string
      driverTaxId: string
      position: number
    }>[]
    stops: readonly TripStopDetailContract[]
  }>

export const TRIP = {
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-28T12:00:00.000Z',
  id: TRIP_ID,
  status: 'draft',
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const satisfies TripContract

export const SECOND_TRIP = {
  ...TRIP,
  createdAt: '2026-07-27T09:30:00.000Z',
  id: SECOND_TRIP_ID,
  status: 'completed',
  updatedAt: '2026-07-27T10:00:00.000Z',
} as const satisfies TripContract

export const TRIP_DOCUMENT = {
  createdAt: '2026-07-28T12:05:00.000Z',
  deliveredAt: null,
  freightCalculationId: null,
  id: DOCUMENT_ID,
  loadedAt: null,
  nfeDocumentId: NFE_DOCUMENT_ID,
  releasedAt: null,
  returnedAt: null,
  returnReason: null,
  separatedAt: null,
  separationStatus: 'pending',
  stopId: null,
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
  drivers: [
    { driverId: DRIVER_ID, driverName: 'Jose da Silva', driverTaxId: '12345678901', position: 1 },
  ],
  stops: [],
} as const satisfies TripDetailContract

export const TRIP_PAGE = {
  items: [TRIP, SECOND_TRIP],
  nextCursor: SYNTHETIC_CURSOR,
} as const

export const CREATE_TRIP_BODY = {
  driverIds: [DRIVER_ID],
  vehicleId: VEHICLE_ID,
} as const

export const NFE_ACCESS_KEY = '352608A1B2C3D4E5F655555555555555555555555555'

/** A linha que `/nfe-documents` serve tem 22 campos; a viagem lê nove e ignora o resto. */
export const NFE_DOCUMENT_LISTING_ROW = {
  accessKey: NFE_ACCESS_KEY,
  cteBlockReason: null,
  emitterAddress: 'Rua das Cargas, 100',
  emitterCity: 'Ribeirao Preto',
  emitterCityCode: '3543402',
  emitterName: 'Industria Sintetica LTDA',
  emitterState: 'SP',
  emitterTaxId: 'A1B2C3D4E5F655',
  id: NFE_DOCUMENT_ID,
  issuedAt: '2026-08-20T09:15:00.000Z',
  nfseInvoiceId: null,
  nfseInvoiceNumber: null,
  number: '000123456',
  recipientAddress: 'Avenida do Deposito, 44',
  recipientCity: 'Barrinha',
  recipientCityCode: '3505500',
  recipientName: 'Comercio Sintetico ME',
  recipientState: 'SP',
  recipientTaxId: '12345678000199',
  series: '001',
  status: 'authorized',
  totalAmount: '1250.7500',
  variant: 'complete',
} as const

export const SCANNED_NFE_DOCUMENT = {
  accessKey: NFE_ACCESS_KEY,
  emitterName: NFE_DOCUMENT_LISTING_ROW.emitterName,
  id: NFE_DOCUMENT_ID,
  issuedAt: NFE_DOCUMENT_LISTING_ROW.issuedAt,
  number: NFE_DOCUMENT_LISTING_ROW.number,
  recipientName: NFE_DOCUMENT_LISTING_ROW.recipientName,
  series: NFE_DOCUMENT_LISTING_ROW.series,
  status: NFE_DOCUMENT_LISTING_ROW.status,
  totalAmount: NFE_DOCUMENT_LISTING_ROW.totalAmount,
} as const

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
