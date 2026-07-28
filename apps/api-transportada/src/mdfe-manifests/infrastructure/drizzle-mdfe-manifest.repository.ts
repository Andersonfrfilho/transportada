/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import {
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
} from '../../database/mdfe.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  CreateMdfeManifestRecord,
  MdfeFiscalSettings,
  MdfeManifestDetail,
  MdfeManifestDriver,
  MdfeManifestFilters,
  MdfeManifestPage,
  MdfeManifestRepositoryPort,
  MdfeManifestVehicle,
} from '../application/mdfe-manifest.port.js'
import { MDFE_BLOCK_REASON } from '../domain/mdfe-manifest-eligibility.policy.js'
import type { MdfeCandidateDocument } from '../domain/mdfe-manifest-eligibility.policy.js'
import { MdfeManifestDocumentsBlockedError } from '../domain/mdfe-manifest.error.js'
import { loadCandidateDocuments } from './mdfe-candidate-document.query.js'
import {
  buildFiscalProfileFilters,
  buildFleetDriverFilters,
  buildFleetVehicleFilters,
  buildManifestDriverFilters,
  buildManifestFilters,
  buildManifestItemFilters,
  buildManifestListFilters,
  buildManifestLoadingCityFilters,
} from './mdfe-manifest.query.js'
import {
  mapManifest,
  mapManifestDriver,
  mapManifestItem,
  mapManifestLoadingCity,
} from './mdfe-manifest.mapper.js'
import type { MdfeDatabase, MdfeQueryable, MdfeTransaction } from './mdfe-queryable.type.js'

const LIVE_DOCUMENT_CONSTRAINT = 'mdfe_manifest_items_live_document_unique'

export class DrizzleMdfeManifestRepository implements MdfeManifestRepositoryPort {
  public constructor(private readonly database: MdfeDatabase) {}

  public async create(input: CreateMdfeManifestRecord): Promise<MdfeManifestDetail> {
    try {
      return await this.database.transaction(async (transaction) => {
        const manifestId = await insertManifest(transaction, input)
        await insertChildren(transaction, { ...input, manifestId })
        const detail = await readManifestDetail(transaction, {
          companyId: input.companyId,
          manifestId,
        })
        if (detail === null) throw new Error('MDFE_MANIFEST_CREATE_FAILED')
        return detail
      })
    } catch (error) {
      if (violatedUniqueConstraint(error) === LIVE_DOCUMENT_CONSTRAINT) {
        throw new MdfeManifestDocumentsBlockedError([
          { reason: MDFE_BLOCK_REASON.alreadyManifested },
        ])
      }
      throw error
    }
  }

  public async findById(input: {
    readonly companyId: string
    readonly manifestId: string
  }): Promise<MdfeManifestDetail | null> {
    return readManifestDetail(this.database, input)
  }

  public async findFiscalSettings(input: {
    readonly companyId: string
  }): Promise<MdfeFiscalSettings | null> {
    const [record] = await this.database
      .select({
        environment: companyFiscalProfiles.environment,
        rntrc: companyFiscalProfiles.rntrc,
      })
      .from(companyFiscalProfiles)
      .where(and(...buildFiscalProfileFilters(input)))
      .limit(1)
    return record === undefined ? null : { environment: record.environment, rntrc: record.rntrc }
  }

  public async findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<MdfeManifestVehicle | null> {
    const [record] = await this.database
      .select({
        id: fleetVehicles.id,
        plate: fleetVehicles.plate,
        role: fleetVehicles.role,
        status: fleetVehicles.status,
      })
      .from(fleetVehicles)
      .where(and(...buildFleetVehicleFilters(input)))
      .limit(1)
    return record ?? null
  }

  public async listCandidateDocuments(input: {
    readonly companyId: string
    readonly fiscalDocumentIds: readonly string[]
  }): Promise<readonly MdfeCandidateDocument[]> {
    return loadCandidateDocuments(this.database, input)
  }

  public async listDrivers(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly MdfeManifestDriver[]> {
    if (input.driverIds.length === 0) return []
    return this.database
      .select({
        id: fleetDrivers.id,
        name: fleetDrivers.name,
        status: fleetDrivers.status,
        taxId: fleetDrivers.taxId,
      })
      .from(fleetDrivers)
      .where(and(...buildFleetDriverFilters(input)))
  }

  public async listManifests(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: MdfeManifestFilters
    readonly limit: number
  }): Promise<MdfeManifestPage> {
    const records = await this.database
      .select()
      .from(mdfeManifests)
      .where(
        and(
          ...buildManifestListFilters({
            companyId: input.companyId,
            cursor: decodeKeysetCursor(input.cursor),
            ...(input.filters === undefined ? {} : { filters: input.filters }),
          }),
        ),
      )
      .orderBy(desc(mdfeManifests.createdAt), desc(mdfeManifests.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)

    return {
      items: pageRecords.map(mapManifest),
      nextCursor:
        records.length > input.limit && last !== undefined ? encodeKeysetCursor(last) : null,
    }
  }
}

async function readManifestDetail(
  queryable: MdfeQueryable,
  input: { readonly companyId: string; readonly manifestId: string },
): Promise<MdfeManifestDetail | null> {
  const [record] = await queryable
    .select()
    .from(mdfeManifests)
    .where(and(...buildManifestFilters(input)))
    .limit(1)
  if (record === undefined) return null

  const drivers = await queryable
    .select()
    .from(mdfeManifestDrivers)
    .where(and(...buildManifestDriverFilters(input)))
    .orderBy(asc(mdfeManifestDrivers.position))
  const items = await queryable
    .select()
    .from(mdfeManifestItems)
    .where(and(...buildManifestItemFilters(input)))
    .orderBy(asc(mdfeManifestItems.createdAt), asc(mdfeManifestItems.id))
  const loadingCities = await queryable
    .select()
    .from(mdfeManifestLoadingCities)
    .where(and(...buildManifestLoadingCityFilters(input)))
    .orderBy(asc(mdfeManifestLoadingCities.position))

  return {
    ...mapManifest(record),
    drivers: drivers.map(mapManifestDriver),
    items: items.map(mapManifestItem),
    loadingCities: loadingCities.map(mapManifestLoadingCity),
  }
}

async function insertManifest(
  transaction: MdfeTransaction,
  input: CreateMdfeManifestRecord,
): Promise<string> {
  const [created] = await transaction
    .insert(mdfeManifests)
    .values({
      additionalInformation: input.manifest.additionalInformation,
      cargoProduct: input.manifest.cargoProduct,
      cargoProductNcm: input.manifest.cargoProductNcm,
      cargoType: input.manifest.cargoType,
      cargoUnit: input.manifest.cargoUnit,
      cargoValue: input.manifest.cargoValue,
      cargoWeight: input.manifest.cargoWeight,
      companyId: input.companyId,
      contractorName: input.manifest.contractorName,
      contractorTaxId: input.manifest.contractorTaxId,
      cteCount: BigInt(input.manifest.cteCount),
      destinationState: input.manifest.destinationState,
      dischargePostalCode: input.manifest.dischargePostalCode,
      emitterType: input.manifest.emitterType,
      fiscalEnvironment: input.manifest.fiscalEnvironment,
      freightValue: input.manifest.freightValue,
      insuranceEndorsement: input.manifest.insuranceEndorsement,
      loadingPostalCode: input.manifest.loadingPostalCode,
      originState: input.manifest.originState,
      rntrc: input.manifest.rntrc,
      transporterType: input.manifest.transporterType,
      tripStartedAt:
        input.manifest.tripStartedAt === null ? null : new Date(input.manifest.tripStartedAt),
      vehicleId: input.manifest.vehicleId,
    })
    .returning({ id: mdfeManifests.id })
  if (created === undefined) throw new Error('MDFE_MANIFEST_CREATE_FAILED')
  return created.id
}

async function insertChildren(
  transaction: MdfeTransaction,
  input: CreateMdfeManifestRecord & { readonly manifestId: string },
): Promise<void> {
  await transaction.insert(mdfeManifestItems).values(
    input.items.map((item) => ({
      accessKey: item.accessKey,
      cargoValue: item.cargoValue,
      cargoWeight: item.cargoWeight,
      companyId: input.companyId,
      cteFiscalDocumentId: item.cteFiscalDocumentId,
      dischargeCityCode: item.dischargeCityCode,
      dischargeCityName: item.dischargeCityName,
      manifestId: input.manifestId,
    })),
  )
  await transaction.insert(mdfeManifestDrivers).values(
    input.drivers.map((driver) => ({
      companyId: input.companyId,
      driverId: driver.driverId,
      driverName: driver.driverName,
      driverTaxId: driver.driverTaxId,
      manifestId: input.manifestId,
      position: BigInt(driver.position),
    })),
  )
  await transaction.insert(mdfeManifestLoadingCities).values(
    input.loadingCities.map((city) => ({
      cityCode: city.cityCode,
      cityName: city.cityName,
      companyId: input.companyId,
      manifestId: input.manifestId,
      position: BigInt(city.position),
    })),
  )
}
