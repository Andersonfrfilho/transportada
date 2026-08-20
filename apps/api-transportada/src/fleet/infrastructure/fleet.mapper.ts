/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  fleetDrivers,
  fleetVehicles,
  MdfeOwnerTaxRegime,
} from '../../database/fleet.schema.js'
import type { EffectiveFuelPrice } from '../../companies/domain/fuel-price.policy.js'
import { MEASURE_SCALE, formatDecimalAtScale } from '../../shared/decimal.service.js'
import type { FuelProduct } from '../../shared/fuel.constant.js'
import type {
  FleetDriver,
  FleetDriverInput,
  FleetVehicle,
  FleetVehicleFuelPrice,
  FleetVehicleInput,
} from '../application/fleet.port.js'
import { deriveCostPerKilometer, deriveMonthlyFixedCost } from '../domain/vehicle-cost.policy.js'

type DriverRecord = typeof fleetDrivers.$inferSelect
type VehicleRecord = typeof fleetVehicles.$inferSelect

const OWN_OWNERSHIP = 'own'

type MapVehicleParams = {
  readonly fuelPrices: ReadonlyMap<FuelProduct, EffectiveFuelPrice>
  readonly record: VehicleRecord
}

export function mapVehicle({ fuelPrices, record }: MapVehicleParams): FleetVehicle {
  const fuelPrice = mapFuelPrice(fuelPrices.get(record.fuelType))
  const derived = deriveCostPerKilometer({
    averageConsumption: record.averageConsumption,
    fuelPricePerUnit: fuelPrice?.pricePerUnit ?? null,
    otherCostsPerKilometer: record.otherCostsPerKilometer,
  })

  return {
    acquisitionAmount: record.acquisitionAmount,
    annualInsuranceAmount: record.annualInsuranceAmount,
    annualVehicleTaxAmount: record.annualVehicleTaxAmount,
    averageConsumption: record.averageConsumption,
    axleCount: record.axleCount,
    bodyType: record.bodyType,
    brand: record.brand,
    capacityCubicMeters: formatDecimalAtScale(record.capacityM3, MEASURE_SCALE),
    capacityKilograms: formatDecimalAtScale(record.capacityKg, MEASURE_SCALE),
    color: record.color,
    costPerKilometer: derived?.total ?? null,
    costPerKilometerBreakdown: derived?.breakdown ?? null,
    costsUpdatedAt: record.costsUpdatedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    fleetNumber: record.fleetNumber,
    freightClass: record.freightClass,
    fuelPrice,
    fuelType: record.fuelType,
    id: record.id,
    model: record.model,
    modelYear: record.modelYear,
    monthlyFixedCost: deriveMonthlyFixedCost({
      annualInsuranceAmount: record.annualInsuranceAmount,
      annualVehicleTaxAmount: record.annualVehicleTaxAmount,
      monthlyInstallmentAmount: record.monthlyInstallmentAmount,
    }),
    monthlyInstallmentAmount: record.monthlyInstallmentAmount,
    otherCostsPerKilometer: record.otherCostsPerKilometer,
    owner:
      record.ownership === OWN_OWNERSHIP
        ? null
        : {
            name: record.ownerName,
            rntrc: record.ownerRntrc,
            state: record.ownerState,
            taxId: record.ownerTaxId,
            taxRegime: record.ownerTaxRegime as MdfeOwnerTaxRegime,
          },
    ownership: record.ownership,
    plate: record.plate,
    renavam: record.renavam,
    role: record.role,
    state: record.state,
    status: record.status,
    tareWeightKilograms: formatDecimalAtScale(record.tareWeightKg, MEASURE_SCALE),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
    wheelType: record.wheelType,
  }
}

function mapFuelPrice(price: EffectiveFuelPrice | undefined): FleetVehicleFuelPrice | null {
  if (price?.effectivePricePerUnit == null || price.source === null) return null

  return {
    pricePerUnit: price.effectivePricePerUnit,
    source: price.source,
    unit: price.unit,
    weekEndingOn: price.reference?.weekEndingOn ?? null,
  }
}

export function toVehicleColumns(
  vehicle: FleetVehicleInput,
): Omit<typeof fleetVehicles.$inferInsert, 'companyId' | 'costsUpdatedAt' | 'status' | 'version'> {
  return {
    acquisitionAmount: vehicle.acquisitionAmount,
    annualInsuranceAmount: vehicle.annualInsuranceAmount,
    annualVehicleTaxAmount: vehicle.annualVehicleTaxAmount,
    averageConsumption: vehicle.averageConsumption,
    axleCount: vehicle.axleCount,
    bodyType: vehicle.bodyType,
    brand: vehicle.brand,
    capacityKg: vehicle.capacityKilograms,
    capacityM3: vehicle.capacityCubicMeters,
    color: vehicle.color,
    fleetNumber: vehicle.fleetNumber,
    freightClass: vehicle.freightClass,
    fuelType: vehicle.fuelType,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    monthlyInstallmentAmount: vehicle.monthlyInstallmentAmount,
    otherCostsPerKilometer: vehicle.otherCostsPerKilometer,
    ownerName: vehicle.owner?.name ?? '',
    ownerRntrc: vehicle.owner?.rntrc ?? '',
    ownerState: vehicle.owner?.state ?? '',
    ownerTaxId: vehicle.owner?.taxId ?? '',
    ownerTaxRegime: vehicle.owner?.taxRegime ?? '',
    ownership: vehicle.ownership,
    plate: vehicle.plate,
    renavam: vehicle.renavam,
    role: vehicle.role,
    state: vehicle.state,
    tareWeightKg: vehicle.tareWeightKilograms,
    wheelType: vehicle.wheelType,
  }
}

export function mapDriver(record: DriverRecord): FleetDriver {
  return {
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    licenseNumber: record.licenseNumber,
    linkedTaxId: record.linkedTaxId,
    membershipId: record.membershipId,
    name: record.name,
    phone: record.phone,
    status: record.status,
    taxId: record.taxId,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}

export function toDriverColumns(
  driver: FleetDriverInput,
): Omit<typeof fleetDrivers.$inferInsert, 'companyId' | 'status' | 'version'> {
  return {
    licenseNumber: driver.licenseNumber,
    linkedTaxId: driver.linkedTaxId,
    membershipId: driver.membershipId,
    name: driver.name,
    phone: driver.phone,
    taxId: driver.taxId,
  }
}
