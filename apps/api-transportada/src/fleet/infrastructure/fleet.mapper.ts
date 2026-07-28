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

type DriverRecord = typeof fleetDrivers.$inferSelect
type VehicleRecord = typeof fleetVehicles.$inferSelect

const OWN_OWNERSHIP = 'own'

export function mapVehicle(record: VehicleRecord): FleetVehicle {
  return {
    bodyType: record.bodyType,
    capacityCubicMeters: record.capacityM3.toString(),
    capacityKilograms: record.capacityKg.toString(),
    createdAt: record.createdAt.toISOString(),
    id: record.id,
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
): Omit<typeof fleetVehicles.$inferInsert, 'companyId' | 'status' | 'version'> {
  return {
    bodyType: vehicle.bodyType,
    capacityKg: BigInt(vehicle.capacityKilograms),
    capacityM3: BigInt(vehicle.capacityCubicMeters),
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
    membershipId: driver.membershipId,
    name: driver.name,
    phone: driver.phone,
    taxId: driver.taxId,
  }
}
