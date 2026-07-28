/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import {
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
} from '../../database/mdfe.schema.js'
import type {
  MdfeIssuanceEmitter,
  MdfeIssuancePayloadSource,
} from '../application/mdfe-issuance.port.js'
import type {
  MdfePayloadCity,
  MdfePayloadCompanyDefaults,
  MdfePayloadDocument,
  MdfePayloadDriver,
  MdfePayloadManifest,
  MdfePayloadVehicle,
} from '../domain/mdfe-payload.types.js'

import type { MdfeQueryable } from './mdfe-queryable.type.js'

export type MdfeIssuancePayloadSourceQuery = {
  readonly companyId: string
  readonly manifestId: string
}

export async function findMdfeIssuancePayloadSource(
  queryable: MdfeQueryable,
  query: MdfeIssuancePayloadSourceQuery,
): Promise<MdfeIssuancePayloadSource | null> {
  const head = await loadManifestAndVehicle(queryable, query)
  if (head === null) return null

  const [documents, drivers, loadingCities, emitter] = await Promise.all([
    loadDocuments(queryable, query),
    loadDrivers(queryable, query),
    loadLoadingCities(queryable, query),
    loadEmitter(queryable, query.companyId),
  ])
  if (emitter === null) return null

  return {
    companyDefaults: emitter.mdfeDefaults,
    documents,
    drivers,
    emitter: emitter.profile,
    loadingCities,
    manifest: head.manifest,
    vehicle: head.vehicle,
  }
}

async function loadManifestAndVehicle(
  queryable: MdfeQueryable,
  query: MdfeIssuancePayloadSourceQuery,
): Promise<{
  readonly manifest: MdfePayloadManifest
  readonly vehicle: MdfePayloadVehicle
} | null> {
  const [record] = await queryable
    .select({
      additionalInformation: mdfeManifests.additionalInformation,
      bodyType: fleetVehicles.bodyType,
      capacityKg: fleetVehicles.capacityKg,
      capacityM3: fleetVehicles.capacityM3,
      cargoProduct: mdfeManifests.cargoProduct,
      cargoProductNcm: mdfeManifests.cargoProductNcm,
      cargoType: mdfeManifests.cargoType,
      cargoUnit: mdfeManifests.cargoUnit,
      cargoValue: mdfeManifests.cargoValue,
      cargoWeight: mdfeManifests.cargoWeight,
      contractorName: mdfeManifests.contractorName,
      contractorTaxId: mdfeManifests.contractorTaxId,
      destinationState: mdfeManifests.destinationState,
      dischargePostalCode: mdfeManifests.dischargePostalCode,
      emitterType: mdfeManifests.emitterType,
      freightValue: mdfeManifests.freightValue,
      insuranceEndorsement: mdfeManifests.insuranceEndorsement,
      loadingPostalCode: mdfeManifests.loadingPostalCode,
      originState: mdfeManifests.originState,
      ownerName: fleetVehicles.ownerName,
      ownerRntrc: fleetVehicles.ownerRntrc,
      ownerState: fleetVehicles.ownerState,
      ownerTaxId: fleetVehicles.ownerTaxId,
      ownerTaxRegime: fleetVehicles.ownerTaxRegime,
      ownership: fleetVehicles.ownership,
      plate: fleetVehicles.plate,
      renavam: fleetVehicles.renavam,
      rntrc: mdfeManifests.rntrc,
      tareWeightKg: fleetVehicles.tareWeightKg,
      transporterType: mdfeManifests.transporterType,
      tripStartedAt: mdfeManifests.tripStartedAt,
      vehicleState: fleetVehicles.state,
      wheelType: fleetVehicles.wheelType,
    })
    .from(mdfeManifests)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fleetVehicles.companyId, mdfeManifests.companyId),
        eq(fleetVehicles.id, mdfeManifests.vehicleId),
      ),
    )
    .where(
      and(eq(mdfeManifests.companyId, query.companyId), eq(mdfeManifests.id, query.manifestId)),
    )
    .limit(1)
  if (record === undefined) return null

  return {
    manifest: {
      additionalInformation: record.additionalInformation,
      cargoProduct: record.cargoProduct,
      cargoProductNcm: record.cargoProductNcm,
      cargoType: record.cargoType,
      cargoUnit: record.cargoUnit,
      cargoValue: record.cargoValue,
      cargoWeight: record.cargoWeight,
      contractorName: record.contractorName,
      contractorTaxId: record.contractorTaxId,
      destinationState: record.destinationState,
      dischargePostalCode: record.dischargePostalCode,
      emitterType: record.emitterType,
      freightValue: record.freightValue,
      insuranceEndorsement: record.insuranceEndorsement,
      loadingPostalCode: record.loadingPostalCode,
      originState: record.originState,
      rntrc: record.rntrc,
      transporterType: record.transporterType,
      tripStartedAt: record.tripStartedAt?.toISOString() ?? null,
    },
    vehicle: {
      bodyType: record.bodyType,
      capacityKg: record.capacityKg,
      capacityM3: record.capacityM3,
      ownerName: record.ownerName,
      ownerRntrc: record.ownerRntrc,
      ownerState: record.ownerState,
      ownerTaxId: record.ownerTaxId,
      ownerTaxRegime: record.ownerTaxRegime,
      ownership: record.ownership,
      plate: record.plate,
      renavam: record.renavam,
      state: record.vehicleState,
      tareWeightKg: record.tareWeightKg,
      wheelType: record.wheelType,
    },
  }
}

/** Item liberado saiu do manifesto e não pode voltar para o XML. */
async function loadDocuments(
  queryable: MdfeQueryable,
  query: MdfeIssuancePayloadSourceQuery,
): Promise<readonly MdfePayloadDocument[]> {
  return queryable
    .select({
      accessKey: mdfeManifestItems.accessKey,
      cargoValue: mdfeManifestItems.cargoValue,
      cargoWeight: mdfeManifestItems.cargoWeight,
      dischargeCityCode: mdfeManifestItems.dischargeCityCode,
      dischargeCityName: mdfeManifestItems.dischargeCityName,
    })
    .from(mdfeManifestItems)
    .where(
      and(
        eq(mdfeManifestItems.companyId, query.companyId),
        eq(mdfeManifestItems.manifestId, query.manifestId),
        isNull(mdfeManifestItems.releasedAt),
      ),
    )
    .orderBy(asc(mdfeManifestItems.accessKey))
}

async function loadDrivers(
  queryable: MdfeQueryable,
  query: MdfeIssuancePayloadSourceQuery,
): Promise<readonly MdfePayloadDriver[]> {
  return queryable
    .select({ name: mdfeManifestDrivers.driverName, taxId: mdfeManifestDrivers.driverTaxId })
    .from(mdfeManifestDrivers)
    .where(
      and(
        eq(mdfeManifestDrivers.companyId, query.companyId),
        eq(mdfeManifestDrivers.manifestId, query.manifestId),
      ),
    )
    .orderBy(asc(mdfeManifestDrivers.position))
}

async function loadLoadingCities(
  queryable: MdfeQueryable,
  query: MdfeIssuancePayloadSourceQuery,
): Promise<readonly MdfePayloadCity[]> {
  return queryable
    .select({
      code: mdfeManifestLoadingCities.cityCode,
      name: mdfeManifestLoadingCities.cityName,
    })
    .from(mdfeManifestLoadingCities)
    .where(
      and(
        eq(mdfeManifestLoadingCities.companyId, query.companyId),
        eq(mdfeManifestLoadingCities.manifestId, query.manifestId),
      ),
    )
    .orderBy(asc(mdfeManifestLoadingCities.position))
}

async function loadEmitter(
  queryable: MdfeQueryable,
  companyId: string,
): Promise<{
  readonly mdfeDefaults: MdfePayloadCompanyDefaults
  readonly profile: MdfeIssuanceEmitter
} | null> {
  const [record] = await queryable
    .select({
      city: companyFiscalProfiles.city,
      cityIbgeCode: companyFiscalProfiles.cityIbgeCode,
      cnpj: companyFiscalProfiles.cnpj,
      district: companyFiscalProfiles.district,
      legalName: companyFiscalProfiles.legalName,
      mdfeInsurancePolicy: companyFiscalProfiles.mdfeInsurancePolicy,
      mdfeInsuranceResponsibility: companyFiscalProfiles.mdfeInsuranceResponsibility,
      mdfeInsurerName: companyFiscalProfiles.mdfeInsurerName,
      mdfeInsurerTaxId: companyFiscalProfiles.mdfeInsurerTaxId,
      mdfePaymentBankBranch: companyFiscalProfiles.mdfePaymentBankBranch,
      mdfePaymentBankCode: companyFiscalProfiles.mdfePaymentBankCode,
      mdfePaymentPixKey: companyFiscalProfiles.mdfePaymentPixKey,
      number: companyFiscalProfiles.number,
      postalCode: companyFiscalProfiles.postalCode,
      state: companyFiscalProfiles.state,
      stateRegistration: companyFiscalProfiles.stateRegistration,
      street: companyFiscalProfiles.street,
      taxRegime: companyFiscalProfiles.taxRegime,
    })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, companyId))
    .limit(1)
  if (record === undefined) return null

  return {
    mdfeDefaults: {
      bank: {
        bankBranch: record.mdfePaymentBankBranch,
        bankCode: record.mdfePaymentBankCode,
        pixKey: record.mdfePaymentPixKey,
      },
      insurance: {
        insurerName: record.mdfeInsurerName,
        insurerTaxId: record.mdfeInsurerTaxId,
        policy: record.mdfeInsurancePolicy,
        responsibility: record.mdfeInsuranceResponsibility,
      },
    },
    profile: {
      city: record.city,
      cityIbgeCode: record.cityIbgeCode,
      cnpj: record.cnpj,
      district: record.district,
      legalName: record.legalName,
      number: record.number,
      postalCode: record.postalCode,
      state: record.state,
      stateRegistration: record.stateRegistration,
      street: record.street,
      taxRegime: record.taxRegime,
    },
  }
}
