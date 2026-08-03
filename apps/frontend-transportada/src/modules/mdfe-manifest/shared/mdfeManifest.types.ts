/* Copyright (c) 2026 Ada Technology. MIT License. */
export const MDFE_MANIFEST_STATUS = [
  'draft',
  'issuing',
  'authorized',
  'rejected',
  'closed',
  'cancelled',
  'discarded',
] as const
export type MdfeManifestStatus = (typeof MDFE_MANIFEST_STATUS)[number]

/** tpEmit — 1 prestador de serviço, 2 carga própria, 3 prestador com CT-e globalizado. */
export const MDFE_EMITTER_TYPE = ['1', '2', '3'] as const
export type MdfeEmitterType = (typeof MDFE_EMITTER_TYPE)[number]

/** tpTransp — 1 ETC, 2 TAC, 3 CTC. Vazio quando o emitente não é transportador contratado. */
export const MDFE_TRANSPORTER_TYPE = ['1', '2', '3'] as const
export type MdfeTransporterType = (typeof MDFE_TRANSPORTER_TYPE)[number]

/** tpCarga — 01 granel sólido até 12 granel pressurizada. */
export const MDFE_CARGO_TYPE = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const
export type MdfeCargoType = (typeof MDFE_CARGO_TYPE)[number]

/** cUnid — 01 KG, 02 tonelada. */
export const MDFE_CARGO_UNIT = ['01', '02'] as const
export type MdfeCargoUnit = (typeof MDFE_CARGO_UNIT)[number]

export const MDFE_FISCAL_ENVIRONMENT = ['homologation', 'production'] as const
export type MdfeFiscalEnvironment = (typeof MDFE_FISCAL_ENVIRONMENT)[number]

export const MDFE_ATTEMPT_KIND = ['issue', 'close', 'cancel'] as const
export type MdfeAttemptKind = (typeof MDFE_ATTEMPT_KIND)[number]

/** `message` vem `null` quando a SEFAZ recusou sem texto — não é o mesmo que não ter recusa. */
export type MdfeManifestRejection = Readonly<{
  attemptKind: MdfeAttemptKind
  code: string
  message: null | string
  occurredAt: string
}>

export type MdfeManifestSummary = Readonly<{
  additionalInformation: string
  cargoProduct: string
  cargoProductNcm: string
  cargoType: '' | MdfeCargoType
  cargoUnit: MdfeCargoUnit
  cargoValue: string
  cargoWeight: string
  contractorName: string
  contractorTaxId: string
  createdAt: string
  cteCount: number
  destinationState: string
  dischargePostalCode: string
  emitterType: MdfeEmitterType
  fiscalEnvironment: MdfeFiscalEnvironment
  fiscalNumber: null | string
  fiscalSeries: string
  freightValue: string
  id: string
  insuranceEndorsement: string
  lastRejection: MdfeManifestRejection | null
  loadingPostalCode: string
  originState: string
  rntrc: string
  status: MdfeManifestStatus
  transporterType: '' | MdfeTransporterType
  tripStartedAt: null | string
  updatedAt: string
  vehicleId: string
  version: string
}>

export type MdfeManifestDriverLine = Readonly<{
  driverId: string
  driverName: string
  driverTaxId: string
  position: number
}>

export type MdfeManifestItemLine = Readonly<{
  accessKey: string
  cargoValue: string
  cargoWeight: string
  cteFiscalDocumentId: string
  dischargeCityCode: string
  dischargeCityName: string
}>

export type MdfeManifestLoadingCityLine = Readonly<{
  cityCode: string
  cityName: string
  position: number
}>

export type MdfeManifestDetail = MdfeManifestSummary &
  Readonly<{
    drivers: readonly MdfeManifestDriverLine[]
    items: readonly MdfeManifestItemLine[]
    loadingCities: readonly MdfeManifestLoadingCityLine[]
  }>

export type MdfeManifestFilters = Readonly<{
  statusEq?: MdfeManifestStatus
  vehicleIdEq?: string
}>

export type MdfeManifestPage = Readonly<{
  items: readonly MdfeManifestSummary[]
  nextCursor: null | string
}>

export type MdfeDocumentBlock = Readonly<{
  fiscalDocumentId: string
  reason: string
}>

export type MdfeManifestableDocument = Readonly<{
  accessKey: string
  cargoValue: string
  cargoWeight: string
  dischargeCityCode: string
  dischargeCityName: string
  dischargeState: string
  fiscalDocumentId: string
  originCityCode: string
  originCityName: string
  originState: string
}>

export type MdfeManifestCity = Readonly<{
  cityCode: string
  cityName: string
  state: string
}>

export type MdfeManifestDischargeCity = MdfeManifestCity &
  Readonly<{ accessKeys: readonly string[] }>

export type MdfeManifestTotals = Readonly<{
  cargoValue: string
  cargoWeight: string
  cteCount: number
}>

export type MdfeManifestPreview = Readonly<{
  blocked: readonly MdfeDocumentBlock[]
  destinationState: string
  destinationStateOptions: readonly string[]
  dischargeCities: readonly MdfeManifestDischargeCity[]
  documents: readonly MdfeManifestableDocument[]
  fiscalEnvironment: MdfeFiscalEnvironment
  loadingCities: readonly MdfeManifestCity[]
  originState: string
  totals: MdfeManifestTotals
}>

export type MdfeIssuanceSummary = Readonly<{
  attemptId: string
  attemptKind: MdfeAttemptKind
  manifestId: string
  manifestStatus: MdfeManifestStatus
  replayed: boolean
  requestedAt: string
}>

export type MdfeManifestCreateBody = Readonly<{
  additionalInformation: string
  cargoProduct: string
  cargoProductNcm: string
  cargoType: '' | MdfeCargoType
  cargoUnit: MdfeCargoUnit
  contractorName: string
  contractorTaxId: string
  destinationState: string
  dischargePostalCode: string
  documentIds: readonly string[]
  driverIds: readonly string[]
  emitterType: MdfeEmitterType
  freightValue: string
  insuranceEndorsement: string
  loadingPostalCode: string
  transporterType: '' | MdfeTransporterType
  tripStartedAt: null | string
  vehicleId: string
}>

export type MdfeManifestListInput = Readonly<{
  cursor: null | string
  filters?: MdfeManifestFilters
  limit: number
}>

export type MdfeActionInput = Readonly<{
  idempotencyKey: string
  manifestId: string
}>

export type MdfeCloseInput = MdfeActionInput &
  Readonly<{ closureCityCode: string; closureState: string }>

export type MdfeCancelInput = MdfeActionInput & Readonly<{ justification: string }>
