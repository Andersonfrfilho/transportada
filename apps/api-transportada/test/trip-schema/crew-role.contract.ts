/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { tripDrivers } from '../../src/database/database.schema.js'
import { TRIP_CREW_ROLES } from '../../src/shared/trip-crew-role.constant.js'
import { checkSqlByName, requiredColumnNames } from '../fiscal-schema/support.js'

describe('trip crew role (spec 149, ADR-0065)', () => {
  /** Toda linha anterior à coluna era condutor — o default é o que mantém isso verdade. */
  test('defaults every crew member to driver', () => {
    const role = getTableConfig(tripDrivers).columns.find((column) => column.name === 'role')

    expect(requiredColumnNames(tripDrivers)).toContain('role')
    expect(role?.default).toBe('driver')
  })

  test('closes the role on the catalog', () => {
    const check = checkSqlByName(tripDrivers).trip_drivers_role_check

    for (const role of TRIP_CREW_ROLES) {
      expect(check).toContain(`'${role}'`)
    }
  })

  /** A posição 1 é quem dirige: ajudante nunca vira o titular do MDF-e. */
  test('keeps the lead position for a driver', () => {
    const check = checkSqlByName(tripDrivers).trip_drivers_lead_role_check

    expect(check).toContain('<> 1')
    expect(check).toContain(`= 'driver'`)
  })
})
