/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'

describe('fleet tenant safety', () => {
  test('anchors every fleet table to a company', () => {
    expect(foreignKeys(fleetVehicles)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_vehicles_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDrivers)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_drivers_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_driver_vehicle_assignments_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  // Um motorista de outra empresa não pode herdar o login desta — o vínculo passa pelo tenant
  test('reaches the membership through the tenant, never by id alone', () => {
    expect(uniqueColumnsByName(userCompanyMemberships)).toMatchObject({
      user_company_memberships_id_company_id_unique: ['id', 'company_id'],
    })
    expect(foreignKeys(fleetDrivers)).toContainEqual({
      columns: ['membership_id', 'company_id'],
      foreignColumns: ['id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'fleet_drivers_company_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('makes an assignment unable to point at another tenant driver or vehicle', () => {
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id', 'driver_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_drivers',
      name: 'fleet_driver_vehicle_assignments_company_driver_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'fleet_driver_vehicle_assignments_company_vehicle_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })
})
