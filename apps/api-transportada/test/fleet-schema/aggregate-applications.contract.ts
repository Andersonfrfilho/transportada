/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { aggregateApplications } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  indexColumnsByName,
} from '../fiscal-schema/support.js'

describe('aggregate applications schema', () => {
  test('a candidatura anônima aponta para a unidade escolhida e para o motorista que ela vira', () => {
    expect(getTableConfig(aggregateApplications).name).toBe('aggregate_applications')

    expect(columnNames(aggregateApplications)).toEqual([
      'id',
      'company_id',
      'tax_id',
      'name',
      'email',
      'phone',
      'declared_data',
      'status',
      'rejection_reason',
      'driver_id',
      'duplicate_driver_id',
      'resubmitted_at',
      'latest_submission',
      'reviewed_at',
      'reviewed_by',
      'created_at',
      'updated_at',
    ])

    expect(foreignKeys(aggregateApplications)).toContainEqual({
      columns: ['driver_id'],
      foreignColumns: ['id'],
      foreignTable: 'fleet_drivers',
      name: 'aggregate_applications_driver_id_fleet_drivers_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(aggregateApplications)).toContainEqual({
      columns: ['duplicate_driver_id'],
      foreignColumns: ['id'],
      foreignTable: 'fleet_drivers',
      name: 'aggregate_applications_duplicate_driver_id_fleet_drivers_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('só existe uma candidatura pendente por documento e por empresa', () => {
    const uniqueIndex = indexColumnsByName(aggregateApplications)
    expect(uniqueIndex.aggregate_applications_company_tax_id_pending_unique).toEqual([
      'company_id',
      'tax_id',
    ])
  })

  test('recusa estado fora da lista, documento fora do formato de CPF/CNPJ, e rejeição sem motivo', () => {
    const checks = checkSqlByName(aggregateApplications)

    expect(checks.aggregate_applications_status_check).toContain(
      "in ('pending', 'approved', 'rejected')",
    )
    expect(checks.aggregate_applications_tax_id_check).toContain('[0-9]{11}')
    expect(checks.aggregate_applications_rejection_reason_check).toContain("<> 'rejected'")
  })
})
