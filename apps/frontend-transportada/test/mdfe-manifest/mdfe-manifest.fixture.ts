/* Copyright (c) 2026 Ada Technology. MIT License. */
export const MDFE_READ = 'mdfe.read'
export const MDFE_MANAGE = 'mdfe.manage'
export const MDFE_ISSUE = 'mdfe.issue'
export const MDFE_CLOSE = 'mdfe.close'
export const MDFE_CANCEL = 'mdfe.cancel'

export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'a2f1c2f2-0d9a-4d4a-9f1b-6f4a5c8e1234'
export const SYNTHETIC_CURSOR = '2026-07-28T12:00:00.000Z::00000000-0000-4000-8000-000000000a11'

export const MANIFEST_ID = '00000000-0000-4000-8000-000000000a11'
export const SECOND_MANIFEST_ID = '00000000-0000-4000-8000-000000000a12'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000911'
export const DRIVER_ID = '00000000-0000-4000-8000-000000000912'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000c01'
export const SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-000000000c02'
export const ATTEMPT_ID = '00000000-0000-4000-8000-000000000d01'

export type MdfeManifestSummaryContract = Readonly<{
  additionalInformation: string
  cargoProduct: string
  cargoProductNcm: string
  cargoType: '' | '01' | '02' | '03' | '04' | '05'
  cargoUnit: '01' | '02'
  cargoValue: string
  cargoWeight: string
  contractorName: string
  contractorTaxId: string
  createdAt: string
  cteCount: number
  destinationState: string
  dischargePostalCode: string
  emitterType: '1' | '2' | '3'
  fiscalEnvironment: 'homologation' | 'production'
  fiscalNumber: null | string
  fiscalSeries: string
  freightValue: string
  id: string
  insuranceEndorsement: string
  lastRejection: null | Readonly<{
    attemptKind: 'cancel' | 'close' | 'issue'
    code: string
    message: null | string
    occurredAt: string
  }>
  loadingPostalCode: string
  originState: string
  rntrc: string
  status: 'authorized' | 'cancelled' | 'closed' | 'discarded' | 'draft' | 'issuing' | 'rejected'
  transporterType: '' | '1' | '2' | '3'
  tripStartedAt: null | string
  updatedAt: string
  vehicleId: string
  version: string
}>

export type MdfeManifestDetailContract = MdfeManifestSummaryContract &
  Readonly<{
    drivers: readonly Readonly<{
      driverId: string
      driverName: string
      driverTaxId: string
      position: number
    }>[]
    items: readonly Readonly<{
      accessKey: string
      cargoValue: string
      cargoWeight: string
      cteFiscalDocumentId: string
      dischargeCityCode: string
      dischargeCityName: string
    }>[]
    loadingCities: readonly Readonly<{
      cityCode: string
      cityName: string
      position: number
    }>[]
  }>

export const MANIFEST_SUMMARY = {
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22011000',
  cargoType: '05',
  cargoUnit: '01',
  cargoValue: '15000.00',
  cargoWeight: '3200.500',
  contractorName: 'Industria Contratante LTDA',
  contractorTaxId: '11222333000181',
  createdAt: '2026-07-28T12:00:00.000Z',
  cteCount: 2,
  destinationState: 'MG',
  dischargePostalCode: '30140071',
  emitterType: '1',
  fiscalEnvironment: 'homologation',
  fiscalNumber: null,
  fiscalSeries: '1',
  freightValue: '2500.00',
  id: MANIFEST_ID,
  insuranceEndorsement: '123456',
  lastRejection: null,
  loadingPostalCode: '14076400',
  originState: 'SP',
  rntrc: '12345678',
  status: 'draft',
  transporterType: '1',
  tripStartedAt: null,
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
  version: '1',
} as const satisfies MdfeManifestSummaryContract

export const AUTHORIZED_MANIFEST_SUMMARY = {
  ...MANIFEST_SUMMARY,
  cargoValue: '9000.00',
  cargoWeight: '1200.000',
  createdAt: '2026-07-27T09:30:00.000Z',
  cteCount: 1,
  fiscalNumber: '000000015',
  id: SECOND_MANIFEST_ID,
  status: 'authorized',
  updatedAt: '2026-07-27T10:00:00.000Z',
  version: '3',
} as const satisfies MdfeManifestSummaryContract

export const REJECTED_MANIFEST_SUMMARY = {
  ...MANIFEST_SUMMARY,
  lastRejection: {
    attemptKind: 'issue',
    code: '726',
    message: 'Rejeicao: Numero do MDF-e ja utilizado',
    occurredAt: '2026-07-28T12:10:00.000Z',
  },
  status: 'rejected',
  updatedAt: '2026-07-28T12:10:00.000Z',
  version: '2',
} as const satisfies MdfeManifestSummaryContract

export const MANIFEST_DETAIL = {
  ...MANIFEST_SUMMARY,
  drivers: [
    {
      driverId: DRIVER_ID,
      driverName: 'Jose da Silva',
      driverTaxId: '12345678901',
      position: 1,
    },
  ],
  items: [
    {
      accessKey: '35260712345678000195570010000000151000000151',
      cargoValue: '10000.00',
      cargoWeight: '2000.000',
      cteFiscalDocumentId: DOCUMENT_ID,
      dischargeCityCode: '3106200',
      dischargeCityName: 'Belo Horizonte',
    },
    {
      accessKey: '35260712345678000195570010000000161000000162',
      cargoValue: '5000.00',
      cargoWeight: '1200.500',
      cteFiscalDocumentId: SECOND_DOCUMENT_ID,
      dischargeCityCode: '3170206',
      dischargeCityName: 'Uberlandia',
    },
  ],
  loadingCities: [{ cityCode: '3550308', cityName: 'Sao Paulo', position: 1 }],
} as const satisfies MdfeManifestDetailContract

/** ADR-0017: o descarte devolve o manifesto já no estado terminal, com os CT-es liberados. */
export const DISCARDED_MANIFEST_DETAIL = {
  ...MANIFEST_DETAIL,
  status: 'discarded',
  updatedAt: '2026-07-29T08:00:00.000Z',
  version: '2',
} as const satisfies MdfeManifestDetailContract

export const MANIFEST_PAGE = {
  items: [MANIFEST_SUMMARY, AUTHORIZED_MANIFEST_SUMMARY],
  nextCursor: SYNTHETIC_CURSOR,
} as const

export const MANIFEST_PREVIEW = {
  blocked: [{ fiscalDocumentId: SECOND_DOCUMENT_ID, reason: 'MDFE_DOCUMENT_ALREADY_MANIFESTED' }],
  destinationState: 'MG',
  destinationStateOptions: ['MG'],
  dischargeCities: [
    {
      accessKeys: ['35260712345678000195570010000000151000000151'],
      cityCode: '3106200',
      cityName: 'Belo Horizonte',
      state: 'MG',
    },
  ],
  documents: [
    {
      accessKey: '35260712345678000195570010000000151000000151',
      cargoValue: '10000.00',
      cargoWeight: '2000.000',
      dischargeCityCode: '3106200',
      dischargeCityName: 'Belo Horizonte',
      dischargeState: 'MG',
      fiscalDocumentId: DOCUMENT_ID,
      originCityCode: '3550308',
      originCityName: 'Sao Paulo',
      originState: 'SP',
    },
  ],
  fiscalEnvironment: 'homologation',
  loadingCities: [{ cityCode: '3550308', cityName: 'Sao Paulo', state: 'SP' }],
  originState: 'SP',
  totals: { cargoValue: '10000.00', cargoWeight: '2000.000', cteCount: 1 },
} as const

export const ISSUANCE_SUMMARY = {
  attemptId: ATTEMPT_ID,
  attemptKind: 'issue',
  manifestId: MANIFEST_ID,
  manifestStatus: 'issuing',
  replayed: false,
  requestedAt: '2026-07-28T12:05:00.000Z',
} as const

export const CREATE_MANIFEST_BODY = {
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22011000',
  cargoType: '05',
  cargoUnit: '01',
  contractorName: 'Industria Contratante LTDA',
  contractorTaxId: '11222333000181',
  destinationState: 'MG',
  dischargePostalCode: '30140071',
  documentIds: [DOCUMENT_ID],
  driverIds: [DRIVER_ID],
  emitterType: '1',
  freightValue: '2500.00',
  insuranceEndorsement: '123456',
  loadingPostalCode: '14076400',
  transporterType: '1',
  tripStartedAt: null,
  vehicleId: VEHICLE_ID,
} as const

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
