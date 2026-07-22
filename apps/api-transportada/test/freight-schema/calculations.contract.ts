import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('freight calculation schema', () => {
  test('persists immutable tenant-scoped snapshots for NF-e freight simulations', () => {
    const freightCalculations = requireSchemaTable('freightCalculations')

    expect(columnNames(freightCalculations)).toEqual([
      'id',
      'company_id',
      'nfe_document_id',
      'freight_rule_id',
      'freight_rule_version_id',
      'rule_version',
      'idempotency_key',
      'request_fingerprint',
      'status',
      'base_amount',
      'percentage',
      'calculated_amount',
      'minimum_amount',
      'maximum_amount',
      'total_amount',
      'adjustments',
      'rule_snapshot',
      'calculation_details',
      'created_by_user_id',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(freightCalculations)).toEqual([
      'id',
      'company_id',
      'nfe_document_id',
      'freight_rule_id',
      'freight_rule_version_id',
      'rule_version',
      'idempotency_key',
      'request_fingerprint',
      'status',
      'base_amount',
      'percentage',
      'calculated_amount',
      'total_amount',
      'adjustments',
      'rule_snapshot',
      'calculation_details',
      'created_by_user_id',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(freightCalculations)).toMatchObject({
      base_amount: 'numeric(19, 4)',
      percentage: 'numeric(9, 6)',
      calculated_amount: 'numeric(19, 4)',
      minimum_amount: 'numeric(19, 4)',
      maximum_amount: 'numeric(19, 4)',
      total_amount: 'numeric(19, 4)',
      adjustments: 'jsonb',
      rule_snapshot: 'jsonb',
      calculation_details: 'jsonb',
    })
    expectGeneratedUuidPrimaryKey(freightCalculations)
    expect(uniqueColumnsByName(freightCalculations)).toMatchObject({
      freight_calculations_company_id_id_unique: ['company_id', 'id'],
      freight_calculations_company_id_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(indexColumnsByName(freightCalculations)).toMatchObject({
      freight_calculations_company_nfe_created_at_idx: [
        'company_id',
        'nfe_document_id',
        'created_at',
      ],
    })
    expect(checkSqlByName(freightCalculations)).toMatchObject({
      freight_calculations_status_check: `"freight_calculations"."status" in ('snapshotted', 'rejected')`,
      freight_calculations_rule_version_check: `"freight_calculations"."rule_version" > 0`,
      freight_calculations_percentage_check: `"freight_calculations"."percentage" >= 0 and "freight_calculations"."percentage" <= 1`,
      freight_calculations_amounts_check: `"freight_calculations"."base_amount" >= 0 and "freight_calculations"."calculated_amount" >= 0 and "freight_calculations"."total_amount" >= 0 and ("freight_calculations"."minimum_amount" is null or "freight_calculations"."minimum_amount" >= 0) and ("freight_calculations"."maximum_amount" is null or "freight_calculations"."maximum_amount" >= 0) and ("freight_calculations"."minimum_amount" is null or "freight_calculations"."maximum_amount" is null or "freight_calculations"."minimum_amount" <= "freight_calculations"."maximum_amount")`,
    })
    expect(foreignKeys(freightCalculations)).toContainEqual({
      columns: ['company_id', 'nfe_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_documents',
      name: 'freight_calculations_company_nfe_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(freightCalculations)).toContainEqual({
      columns: ['company_id', 'freight_rule_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'freight_rules',
      name: 'freight_calculations_company_rule_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(freightCalculations)).toContainEqual({
      columns: ['company_id', 'freight_rule_id', 'rule_version'],
      foreignColumns: ['company_id', 'freight_rule_id', 'version'],
      foreignTable: 'freight_rule_versions',
      name: 'freight_calculations_company_rule_version_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(freightCalculations)).toContainEqual({
      columns: ['created_by_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'freight_calculations_created_by_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
