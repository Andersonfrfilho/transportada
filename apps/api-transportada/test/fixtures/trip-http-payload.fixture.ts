/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeManifestDetail } from '../../src/mdfe-manifests/application/mdfe-manifest.port'
import type {
  Trip,
  TripDetail,
  TripDocument,
  TripDocumentDetail,
  TripPage,
} from '../../src/trips/application/trip.port'

export const TRIPS_PATH = '/trips'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const CORRELATION_ID = 'trip-http-correlation'
export const COMPANY_ID = '00000000-0000-4000-8000-000000000a01'
export const TRIP_ID = '00000000-0000-4000-8000-000000000a11'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000a12'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000a13'
export const SECOND_DRIVER_ID = '00000000-0000-4000-8000-000000000a14'
export const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000a15'
export const FREIGHT_CALCULATION_ID = '00000000-0000-4000-8000-000000000a16'
export const TRIP_DOCUMENT_ID = '00000000-0000-4000-8000-000000000a17'
export const MDFE_CTE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000a18'
export const MDFE_MANIFEST_ID = '00000000-0000-4000-8000-000000000a19'

export function tripDocumentPath(documentId: string = TRIP_DOCUMENT_ID): string {
  return `${TRIPS_PATH}/${TRIP_ID}/documents/${documentId}`
}

export function tripDocumentDeliverPath(documentId: string = TRIP_DOCUMENT_ID): string {
  return `${tripDocumentPath(documentId)}/deliver`
}

export function tripClosePath(tripId: string = TRIP_ID): string {
  return `${TRIPS_PATH}/${tripId}/close`
}

export function tripMdfeManifestsPath(tripId: string = TRIP_ID): string {
  return `${TRIPS_PATH}/${tripId}/mdfe-manifests`
}

export function tripDetailPath(tripId: string = TRIP_ID): string {
  return `${TRIPS_PATH}/${tripId}`
}

export const CREATE_TRIP_BODY = {
  driverIds: [DRIVER_ID, SECOND_DRIVER_ID],
  vehicleId: VEHICLE_ID,
} as const

export const LINK_NFE_DOCUMENT_BODY = {
  freightCalculationId: null,
  nfeDocumentId: NFE_DOCUMENT_ID,
} as const

export const LINK_FREIGHT_CALCULATION_BODY = {
  freightCalculationId: FREIGHT_CALCULATION_ID,
  nfeDocumentId: null,
} as const

export const CREATE_TRIP_MDFE_MANIFEST_BODY = {
  documentIds: [MDFE_CTE_DOCUMENT_ID],
} as const

export const TRIP: Trip = {
  companyId: COMPANY_ID,
  createdAt: '2026-08-04T12:00:00.000Z',
  id: TRIP_ID,
  status: 'open',
  updatedAt: '2026-08-04T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
}

export const TRIP_DOCUMENT: TripDocument = {
  createdAt: '2026-08-04T12:05:00.000Z',
  deliveredAt: null,
  freightCalculationId: null,
  id: TRIP_DOCUMENT_ID,
  nfeDocumentId: NFE_DOCUMENT_ID,
  releasedAt: null,
  tripId: TRIP_ID,
  updatedAt: '2026-08-04T12:05:00.000Z',
}

export const TRIP_DOCUMENT_DETAIL: TripDocumentDetail = {
  ...TRIP_DOCUMENT,
  cteAuthorized: true,
  fiscalStatus: 'authorized',
}

export const TRIP_DETAIL: TripDetail = {
  ...TRIP,
  documents: [TRIP_DOCUMENT_DETAIL],
  drivers: [
    { driverId: DRIVER_ID, driverName: 'Motorista Um', driverTaxId: '11111111111', position: 1 },
    {
      driverId: SECOND_DRIVER_ID,
      driverName: 'Motorista Dois',
      driverTaxId: '22222222222',
      position: 2,
    },
  ],
}

export const TRIP_PAGE: TripPage = {
  items: [TRIP],
  nextCursor: null,
}

export const MDFE_MANIFEST_DETAIL: MdfeManifestDetail = {
  additionalInformation: '',
  cargoProduct: '',
  cargoProductNcm: '',
  cargoType: '',
  cargoUnit: '01',
  cargoValue: '1250.00',
  cargoWeight: '850.0000',
  contractorName: '',
  contractorTaxId: '',
  createdAt: '2026-08-04T12:10:00.000Z',
  cteCount: 1,
  destinationState: 'SP',
  dischargePostalCode: '',
  drivers: [
    { driverId: DRIVER_ID, driverName: 'Motorista Um', driverTaxId: '11111111111', position: 1 },
    {
      driverId: SECOND_DRIVER_ID,
      driverName: 'Motorista Dois',
      driverTaxId: '22222222222',
      position: 2,
    },
  ],
  emitterType: '1',
  fiscalEnvironment: 'homologation',
  fiscalNumber: null,
  fiscalSeries: '',
  freightValue: '0.00',
  id: MDFE_MANIFEST_ID,
  insuranceEndorsement: '',
  items: [
    {
      accessKey: '35260712345678000195570010000000011000000010',
      cargoValue: '1250.00',
      cargoWeight: '850.0000',
      cteFiscalDocumentId: MDFE_CTE_DOCUMENT_ID,
      dischargeCityCode: '3550308',
      dischargeCityName: 'Sao Paulo',
    },
  ],
  lastRejection: null,
  loadingCities: [{ cityCode: '4106902', cityName: 'Curitiba', position: 1 }],
  loadingPostalCode: '',
  originState: 'PR',
  rntrc: '12345678',
  status: 'draft',
  transporterType: '',
  tripId: TRIP_ID,
  tripStartedAt: null,
  updatedAt: '2026-08-04T12:10:00.000Z',
  vehicleId: VEHICLE_ID,
  version: '1',
}

export function jsonRequest(input: {
  readonly body?: unknown
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
}

export async function responseApiError(response: Response): Promise<{
  readonly code: string
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
  return payload.error
}

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}
