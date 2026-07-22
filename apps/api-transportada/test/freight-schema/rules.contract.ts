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

describe('freight rule schema', () => {
  test('defines tenant-scoped rule identity with version pointer and stable lifecycle', () => {
    const freightRules = requireSchemaTable('freightRules')

    expect(columnNames(freightRules)).toEqual([
      'id',
      'company_id',
      'name',
      'description',
      'type',
      'status',
      'priority',
      'current_version',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(freightRules)).toEqual([
      'id',
      'company_id',
      'name',
      'type',
      'status',
      'priority',
      'current_version',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(freightRules)).toEqual({
      id: 'uuid',
      company_id: 'uuid',
      name: 'text',
      description: 'text',
      type: 'text',
      status: 'text',
      priority: 'bigint',
      current_version: 'bigint',
      created_by_user_id: 'uuid',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(freightRules)
    expect(uniqueColumnsByName(freightRules)).toMatchObject({
      freight_rules_company_id_id_unique: ['company_id', 'id'],
      freight_rules_company_id_name_unique: ['company_id', 'name'],
    })
    expect(indexColumnsByName(freightRules)).toMatchObject({
      freight_rules_company_id_status_type_priority_idx: [
        'company_id',
        'status',
        'type',
        'priority',
      ],
    })
    expect(checkSqlByName(freightRules)).toMatchObject({
      freight_rules_type_check: `"freight_rules"."type" in ('percentage_of_invoice_total')`,
      freight_rules_status_check: `"freight_rules"."status" in ('draft', 'active', 'inactive')`,
      freight_rules_priority_check: `"freight_rules"."priority" > 0`,
      freight_rules_current_version_check: `"freight_rules"."current_version" > 0`,
    })
    expect(foreignKeys(freightRules)).toContainEqual({
      columns: ['created_by_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'freight_rules_created_by_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('defines immutable decimal rule versions with validity and overlap guard metadata', () => {
    const freightRuleVersions = requireSchemaTable('freightRuleVersions')

    expect(columnNames(freightRuleVersions)).toEqual([
      'id',
      'company_id',
      'freight_rule_id',
      'version',
      'status',
      'valid_from',
      'valid_until',
      'percentage',
      'minimum_amount',
      'maximum_amount',
      'filters',
      'snapshot',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(freightRuleVersions)).toEqual([
      'id',
      'company_id',
      'freight_rule_id',
      'version',
      'status',
      'valid_from',
      'percentage',
      'filters',
      'snapshot',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(freightRuleVersions)).toMatchObject({
      percentage: 'numeric(9, 6)',
      minimum_amount: 'numeric(19, 4)',
      maximum_amount: 'numeric(19, 4)',
      filters: 'jsonb',
      snapshot: 'jsonb',
    })
    expectGeneratedUuidPrimaryKey(freightRuleVersions)
    expect(uniqueColumnsByName(freightRuleVersions)).toMatchObject({
      freight_rule_versions_company_rule_version_unique: [
        'company_id',
        'freight_rule_id',
        'version',
      ],
    })
    expect(indexColumnsByName(freightRuleVersions)).toMatchObject({
      freight_rule_versions_company_rule_validity_idx: [
        'company_id',
        'freight_rule_id',
        'status',
        'valid_from',
        'valid_until',
      ],
    })
    expect(checkSqlByName(freightRuleVersions)).toMatchObject({
      freight_rule_versions_status_check: `"freight_rule_versions"."status" in ('draft', 'active', 'inactive')`,
      freight_rule_versions_version_check: `"freight_rule_versions"."version" > 0`,
      freight_rule_versions_percentage_check: `"freight_rule_versions"."percentage" >= 0 and "freight_rule_versions"."percentage" <= 1`,
      freight_rule_versions_amounts_check: `("freight_rule_versions"."minimum_amount" is null or "freight_rule_versions"."minimum_amount" >= 0) and ("freight_rule_versions"."maximum_amount" is null or "freight_rule_versions"."maximum_amount" >= 0) and ("freight_rule_versions"."minimum_amount" is null or "freight_rule_versions"."maximum_amount" is null or "freight_rule_versions"."minimum_amount" <= "freight_rule_versions"."maximum_amount")`,
      freight_rule_versions_validity_check: `"freight_rule_versions"."valid_until" is null or "freight_rule_versions"."valid_until" >= "freight_rule_versions"."valid_from"`,
    })
    expect(foreignKeys(freightRuleVersions)).toContainEqual({
      columns: ['company_id', 'freight_rule_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'freight_rules',
      name: 'freight_rule_versions_company_rule_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(freightRuleVersions)).toContainEqual({
      columns: ['created_by_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'freight_rule_versions_created_by_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
