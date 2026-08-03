/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriverStatus,
  FleetVehicleRole,
  FleetVehicleStatus,
} from '../../database/fleet.schema.js'
import type {
  MdfeAttemptKind,
  MdfeCargoType,
  MdfeCargoUnit,
  MdfeEmitterType,
  MdfeFiscalEnvironment,
  MdfeManifestStatus,
  MdfeTransporterType,
} from '../../database/mdfe.schema.js'
import type { MdfeCandidateDocument } from '../domain/mdfe-manifest-eligibility.policy.js'

export type MdfeManifestCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type MdfeFiscalSettings = {
  readonly environment: MdfeFiscalEnvironment
  readonly rntrc: string
}

export type MdfeManifestVehicle = {
  readonly id: string
  readonly plate: string
  readonly role: FleetVehicleRole
  readonly status: FleetVehicleStatus
}

export type MdfeManifestDriver = {
  readonly id: string
  readonly name: string
  readonly status: FleetDriverStatus
  readonly taxId: string
}

export type MdfeManifestDriverLine = {
  readonly driverId: string
  readonly driverName: string
  readonly driverTaxId: string
  readonly position: number
}

export type MdfeManifestItem = {
  readonly accessKey: string
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly cteFiscalDocumentId: string
  readonly dischargeCityCode: string
  readonly dischargeCityName: string
}

export type MdfeManifestLoadingCity = {
  readonly cityCode: string
  readonly cityName: string
  readonly position: number
}

/** `message` fica `null` quando a SEFAZ recusou sem texto — a tela distingue isso de "sem recusa". */
export type MdfeManifestRejection = {
  readonly attemptKind: MdfeAttemptKind
  readonly code: string
  readonly message: string | null
  readonly occurredAt: string
}

export type MdfeManifest = {
  readonly additionalInformation: string
  readonly cargoProduct: string
  readonly cargoProductNcm: string
  readonly cargoType: MdfeCargoType | ''
  readonly cargoUnit: MdfeCargoUnit
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly contractorName: string
  readonly contractorTaxId: string
  readonly createdAt: string
  readonly cteCount: number
  readonly destinationState: string
  readonly dischargePostalCode: string
  readonly emitterType: MdfeEmitterType
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly fiscalNumber: string | null
  readonly fiscalSeries: string
  readonly freightValue: string
  readonly id: string
  readonly insuranceEndorsement: string
  readonly lastRejection: MdfeManifestRejection | null
  readonly loadingPostalCode: string
  readonly originState: string
  readonly rntrc: string
  readonly status: MdfeManifestStatus
  readonly transporterType: MdfeTransporterType | ''
  readonly tripStartedAt: string | null
  readonly updatedAt: string
  readonly vehicleId: string
  readonly version: string
}

export type MdfeManifestDetail = MdfeManifest & {
  readonly drivers: readonly MdfeManifestDriverLine[]
  readonly items: readonly MdfeManifestItem[]
  readonly loadingCities: readonly MdfeManifestLoadingCity[]
}

export type MdfeManifestFilters = {
  readonly statusEq?: MdfeManifestStatus
  readonly vehicleIdEq?: string
}

export type MdfeManifestPage = {
  readonly items: readonly MdfeManifest[]
  readonly nextCursor: string | null
}

export type CreateMdfeManifestHeader = {
  readonly additionalInformation: string
  readonly cargoProduct: string
  readonly cargoProductNcm: string
  readonly cargoType: MdfeCargoType | ''
  readonly cargoUnit: MdfeCargoUnit
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly contractorName: string
  readonly contractorTaxId: string
  readonly cteCount: number
  readonly destinationState: string
  readonly dischargePostalCode: string
  readonly emitterType: MdfeEmitterType
  readonly fiscalEnvironment: MdfeFiscalEnvironment
  readonly freightValue: string
  readonly insuranceEndorsement: string
  readonly loadingPostalCode: string
  readonly originState: string
  readonly rntrc: string
  readonly transporterType: MdfeTransporterType | ''
  readonly tripStartedAt: string | null
  readonly vehicleId: string
}

export type CreateMdfeManifestRecord = {
  readonly companyId: string
  readonly drivers: readonly MdfeManifestDriverLine[]
  readonly items: readonly MdfeManifestItem[]
  readonly loadingCities: readonly MdfeManifestLoadingCity[]
  readonly manifest: CreateMdfeManifestHeader
}

export type MdfeManifestRepositoryPort = {
  create(input: CreateMdfeManifestRecord): Promise<MdfeManifestDetail>
  /** Devolve `null` quando o manifesto saiu de `draft`/`rejected` entre a leitura e o update. */
  discard(input: {
    readonly companyId: string
    readonly manifestId: string
  }): Promise<MdfeManifestDetail | null>
  findById(input: {
    readonly companyId: string
    readonly manifestId: string
  }): Promise<MdfeManifestDetail | null>
  findFiscalSettings(input: { readonly companyId: string }): Promise<MdfeFiscalSettings | null>
  findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<MdfeManifestVehicle | null>
  listCandidateDocuments(input: {
    readonly companyId: string
    readonly fiscalDocumentIds: readonly string[]
  }): Promise<readonly MdfeCandidateDocument[]>
  listDrivers(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly MdfeManifestDriver[]>
  listManifests(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: MdfeManifestFilters
    readonly limit: number
  }): Promise<MdfeManifestPage>
}
