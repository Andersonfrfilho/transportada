/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  fleetDrivers,
  fleetVehicles,
  MdfeOwnerTaxRegime,
} from '../../database/fleet.schema.js'
import type {
  FleetDriver,
  FleetDriverInput,
  FleetVehicle,
  FleetVehicleInput,
} from '../application/fleet.port.js'
import { deriveMonthlyFixedCost } from '../domain/vehicle-cost.policy.js'

type DriverRecord = typeof fleetDrivers.$inferSelect
type VehicleRecord = typeof fleetVehicles.$inferSelect

const OWN_OWNERSHIP = 'own'

export function mapVehicle(record: VehicleRecord): FleetVehicle {
  return {
    acquisitionAmount: record.acquisitionAmount,
    annualInsuranceAmount: record.annualInsuranceAmount,
    annualVehicleTaxAmount: record.annualVehicleTaxAmount,
    averageConsumption: record.averageConsumption,
    axleCount: record.axleCount,
    bodyType: record.bodyType,
    brand: record.brand,
    capacityCubicMeters: record.capacityM3.toString(),
    capacityKilograms: record.capacityKg.toString(),
    color: record.color,
    costPerKilometer: record.costPerKilometer,
    costsUpdatedAt: record.costsUpdatedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    fleetNumber: record.fleetNumber,
    id: record.id,
    model: record.model,
    modelYear: record.modelYear,
    monthlyFixedCost: deriveMonthlyFixedCost({
      annualInsuranceAmount: record.annualInsuranceAmount,
      annualVehicleTaxAmount: record.annualVehicleTaxAmount,
      monthlyInstallmentAmount: record.monthlyInstallmentAmount,
    }),
    monthlyInstallmentAmount: record.monthlyInstallmentAmount,
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
    tareWeightKilograms: record.tareWeightKg.toString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
    wheelType: record.wheelType,
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
    capacityKg: BigInt(vehicle.capacityKilograms),
    capacityM3: BigInt(vehicle.capacityCubicMeters),
    color: vehicle.color,
    costPerKilometer: vehicle.costPerKilometer,
    fleetNumber: vehicle.fleetNumber,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    monthlyInstallmentAmount: vehicle.monthlyInstallmentAmount,
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
    tareWeightKg: BigInt(vehicle.tareWeightKilograms),
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
