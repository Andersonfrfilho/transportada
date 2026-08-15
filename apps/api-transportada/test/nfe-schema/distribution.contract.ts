import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { indexDefinitionsByName, primaryKeyColumns } from './support.js'
import { requireSchemaTable } from './tables.js'

describe('NF-e distribution schema', () => {
  test('stores events independently while keeping tenant, XML, and NSU uniqueness', () => {
    const nfeEvents = requireSchemaTable('nfeEvents')

    expect(columnNames(nfeEvents)).toEqual([
      'id',
      'company_id',
      'target_access_key',
      'event_type',
      'event_sequence',
      'occurred_at',
      'xml_object_id',
      'source_nsu',
      'environment',
      'metadata',
      'created_at',
    ])
    expect(requiredColumnNames(nfeEvents)).toContainAllValues([
      'id',
      'company_id',
      'target_access_key',
      'event_type',
      'event_sequence',
      'occurred_at',
      'xml_object_id',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeEvents)
    expect(uniqueColumnsByName(nfeEvents)).toMatchObject({
      nfe_events_company_id_id_unique: ['company_id', 'id'],
      nfe_events_company_access_key_type_sequence_unique: [
        'company_id',
        'target_access_key',
        'event_type',
        'event_sequence',
      ],
    })
    expect(indexDefinitionsByName(nfeEvents)).toMatchObject({
      nfe_events_company_environment_source_nsu_unique: {
        columns: ['company_id', 'environment', 'source_nsu'],
        isUnique: true,
        where: `"nfe_events"."source_nsu" is not null`,
      },
    })
    expect(foreignKeys(nfeEvents)).toContainEqual({
      columns: ['company_id', 'xml_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'nfe_events_company_xml_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(nfeEvents).map(({ foreignTable }) => foreignTable)).not.toContain(
      'nfe_documents',
    )
    expect(checkSqlByName(nfeEvents)).toMatchObject({
      nfe_events_access_key_check: `"nfe_events"."target_access_key" ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
      nfe_events_sequence_check: `"nfe_events"."event_sequence" > 0`,
      nfe_events_distribution_source_presence_check: `("nfe_events"."source_nsu" is null) = ("nfe_events"."environment" is null)`,
      nfe_events_source_nsu_check: `"nfe_events"."source_nsu" is null or "nfe_events"."source_nsu" ~ '^[0-9]{15}$'`,
      nfe_events_environment_check: `"nfe_events"."environment" is null or "nfe_events"."environment" in ('homologation', 'production')`,
    })
  })

  test('keeps a monotonic NSU cursor and coherent persistent lease per tenant environment', () => {
    const nfeDistributionCursors = requireSchemaTable('nfeDistributionCursors')

    expect(columnNames(nfeDistributionCursors)).toEqual([
      'company_id',
      'environment',
      'ult_nsu',
      'max_nsu',
      'next_allowed_at',
      'consecutive_rate_limits',
      'last_skipped_from_nsu',
      'last_skipped_to_nsu',
      'last_skipped_at',
      'lease_owner',
      'lease_expires_at',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(nfeDistributionCursors)).toContainAllValues([
      'company_id',
      'environment',
      'ult_nsu',
      'max_nsu',
      'consecutive_rate_limits',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(primaryKeyColumns(nfeDistributionCursors)).toEqual([['company_id', 'environment']])
    const initialNsuColumn = getTableConfig(nfeDistributionCursors).columns.find(
      (column) => column.name === 'ult_nsu',
    )
    expect(initialNsuColumn?.hasDefault).toBeTrue()
    expect(initialNsuColumn?.default).toBe('000000000000000')
    expect(checkSqlByName(nfeDistributionCursors)).toMatchObject({
      nfe_distribution_cursors_environment_check: `"nfe_distribution_cursors"."environment" in ('homologation', 'production')`,
      nfe_distribution_cursors_ult_nsu_check: `"nfe_distribution_cursors"."ult_nsu" ~ '^[0-9]{15}$'`,
      nfe_distribution_cursors_max_nsu_check: `"nfe_distribution_cursors"."max_nsu" ~ '^[0-9]{15}$'`,
      nfe_distribution_cursors_monotonic_check: `"nfe_distribution_cursors"."ult_nsu"::numeric <= "nfe_distribution_cursors"."max_nsu"::numeric`,
      nfe_distribution_cursors_version_check: `"nfe_distribution_cursors"."version" > 0`,
      nfe_distribution_cursors_lease_check: `("nfe_distribution_cursors"."lease_owner" is null) = ("nfe_distribution_cursors"."lease_expires_at" is null)`,
    })
  })
})
