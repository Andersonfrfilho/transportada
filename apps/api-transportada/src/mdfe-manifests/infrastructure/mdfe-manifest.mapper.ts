/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
} from '../../database/mdfe.schema.js'
import type {
  MdfeManifest,
  MdfeManifestDriverLine,
  MdfeManifestItem,
  MdfeManifestLoadingCity,
} from '../application/mdfe-manifest.port.js'

type DriverRecord = typeof mdfeManifestDrivers.$inferSelect
type ItemRecord = typeof mdfeManifestItems.$inferSelect
type LoadingCityRecord = typeof mdfeManifestLoadingCities.$inferSelect
type ManifestRecord = typeof mdfeManifests.$inferSelect

export function mapManifest(record: ManifestRecord): MdfeManifest {
  return {
    additionalInformation: record.additionalInformation,
    cargoProduct: record.cargoProduct,
    cargoProductNcm: record.cargoProductNcm,
    cargoType: record.cargoType,
    cargoUnit: record.cargoUnit,
    cargoValue: record.cargoValue,
    cargoWeight: record.cargoWeight,
    contractorName: record.contractorName,
    contractorTaxId: record.contractorTaxId,
    createdAt: record.createdAt.toISOString(),
    cteCount: Number(record.cteCount),
    destinationState: record.destinationState,
    dischargePostalCode: record.dischargePostalCode,
    emitterType: record.emitterType,
    fiscalEnvironment: record.fiscalEnvironment,
    fiscalNumber: record.fiscalNumber === null ? null : record.fiscalNumber.toString(),
    fiscalSeries: record.fiscalSeries,
    freightValue: record.freightValue,
    id: record.id,
    insuranceEndorsement: record.insuranceEndorsement,
    loadingPostalCode: record.loadingPostalCode,
    originState: record.originState,
    rntrc: record.rntrc,
    status: record.status,
    transporterType: record.transporterType,
    tripStartedAt: record.tripStartedAt === null ? null : record.tripStartedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    vehicleId: record.vehicleId,
    version: record.version.toString(),
  }
}

export function mapManifestDriver(record: DriverRecord): MdfeManifestDriverLine {
  return {
    driverId: record.driverId,
    driverName: record.driverName,
    driverTaxId: record.driverTaxId,
    position: Number(record.position),
  }
}

export function mapManifestItem(record: ItemRecord): MdfeManifestItem {
  return {
    accessKey: record.accessKey,
    cargoValue: record.cargoValue,
    cargoWeight: record.cargoWeight,
    cteFiscalDocumentId: record.cteFiscalDocumentId,
    dischargeCityCode: record.dischargeCityCode,
    dischargeCityName: record.dischargeCityName,
  }
}

export function mapManifestLoadingCity(record: LoadingCityRecord): MdfeManifestLoadingCity {
  return {
    cityCode: record.cityCode,
    cityName: record.cityName,
    position: Number(record.position),
  }
}
