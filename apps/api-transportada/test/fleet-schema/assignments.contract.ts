/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import { fleetDriverVehicleAssignments } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const dialect = new PgDialect()

const partialUnique = (name: string) =>
  getTableConfig(fleetDriverVehicleAssignments).indexes.find(
    (tableIndex) => tableIndex.config.name === name,
  )

describe('fleet driver vehicle assignment schema', () => {
  test('records the link as a period, never as a mutable current vehicle', () => {
    expect(getTableConfig(fleetDriverVehicleAssignments).name).toBe(
      'fleet_driver_vehicle_assignments',
    )
    expectGeneratedUuidPrimaryKey(fleetDriverVehicleAssignments)

    expect(columnNames(fleetDriverVehicleAssignments)).toEqual([
      'id',
      'company_id',
      'driver_id',
      'vehicle_id',
      'assigned_at',
      'released_at',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(fleetDriverVehicleAssignments)).toEqual(
      columnNames(fleetDriverVehicleAssignments).filter((column) => column !== 'released_at'),
    )
  })

  test('exposes the composite tenant key and the history index', () => {
    expect(uniqueColumnsByName(fleetDriverVehicleAssignments)).toMatchObject({
      fleet_driver_vehicle_assignments_company_id_id_unique: ['company_id', 'id'],
    })
    expect(indexColumnsByName(fleetDriverVehicleAssignments)).toMatchObject({
      fleet_driver_vehicle_assignments_company_driver_assigned_at_idx: [
        'company_id',
        'driver_id',
        'assigned_at',
      ],
    })
  })

  // Uma viagem tem um veículo e um condutor ao mesmo tempo — o histórico fica nas linhas liberadas
  test('allows a single live assignment per vehicle and per driver', () => {
    const vehicleUnique = partialUnique('fleet_driver_vehicle_assignments_live_vehicle_unique')
    const driverUnique = partialUnique('fleet_driver_vehicle_assignments_live_driver_unique')

    expect(vehicleUnique?.config.unique).toBeTrue()
    expect(
      vehicleUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'vehicle_id'])
    expect(driverUnique?.config.unique).toBeTrue()
    expect(
      driverUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'driver_id'])

    for (const liveUnique of [vehicleUnique, driverUnique]) {
      expect(
        liveUnique?.config.where === undefined
          ? undefined
          : dialect.sqlToQuery(liveUnique.config.where).sql,
      ).toBe(`"fleet_driver_vehicle_assignments"."released_at" is null`)
    }
  })

  test('refuses a release earlier than the assignment', () => {
    expect(
      checkSqlByName(fleetDriverVehicleAssignments).fleet_driver_vehicle_assignments_period_check,
    ).toContain('>=')
  })
})
