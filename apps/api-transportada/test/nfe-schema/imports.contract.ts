import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { indexDefinitionsByName } from './support.js'
import { requireSchemaTable } from './tables.js'

describe('NF-e import schema', () => {
  test('persists tenant-scoped import state, idempotency, counters, and safe errors', () => {
    const nfeImports = requireSchemaTable('nfeImports')

    expect(columnNames(nfeImports)).toEqual([
      'id',
      'company_id',
      'source',
      'triggered_by',
      'automation_job',
      'requested_by_user_id',
      'correlation_id',
      'idempotency_key',
      'request_fingerprint',
      'status',
      'received_count',
      'processed_count',
      'imported_count',
      'duplicated_count',
      'invalid_count',
      'rejected_count',
      'failed_count',
      'terminal_error',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(nfeImports)).toMatchObject({
      id: 'uuid',
      company_id: 'uuid',
      source: 'text',
      triggered_by: 'text',
      automation_job: 'text',
      requested_by_user_id: 'uuid',
      correlation_id: 'text',
      idempotency_key: 'text',
      request_fingerprint: 'text',
      status: 'text',
      received_count: 'bigint',
      processed_count: 'bigint',
      imported_count: 'bigint',
      duplicated_count: 'bigint',
      invalid_count: 'bigint',
      rejected_count: 'bigint',
      failed_count: 'bigint',
      terminal_error: 'jsonb',
      version: 'bigint',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(nfeImports)
    expect(requiredColumnNames(nfeImports)).toEqual(
      columnNames(nfeImports).filter(
        (columnName) => columnName !== 'terminal_error' && columnName !== 'automation_job',
      ),
    )
    expect(uniqueColumnsByName(nfeImports)).toMatchObject({
      nfe_imports_company_id_id_unique: ['company_id', 'id'],
      nfe_imports_company_id_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(checkSqlByName(nfeImports)).toMatchObject({
      nfe_imports_source_check: `"nfe_imports"."source" in ('upload', 'distribution')`,
      nfe_imports_status_check: `"nfe_imports"."status" in ('pending', 'queued', 'processing', 'completed', 'partially_processed', 'failed', 'cancelled')`,
      nfe_imports_counters_check: `"nfe_imports"."received_count" >= 0 and "nfe_imports"."processed_count" >= 0 and "nfe_imports"."imported_count" >= 0 and "nfe_imports"."duplicated_count" >= 0 and "nfe_imports"."invalid_count" >= 0 and "nfe_imports"."rejected_count" >= 0 and "nfe_imports"."failed_count" >= 0 and "nfe_imports"."processed_count" <= "nfe_imports"."received_count" and "nfe_imports"."processed_count" = "nfe_imports"."imported_count" + "nfe_imports"."duplicated_count" + "nfe_imports"."invalid_count" + "nfe_imports"."rejected_count" + "nfe_imports"."failed_count"`,
      nfe_imports_version_check: `"nfe_imports"."version" > 0`,
    })
  })

  test('binds import items to their tenant, import, and immutable source object', () => {
    const nfeImportItems = requireSchemaTable('nfeImportItems')

    expect(columnNames(nfeImportItems)).toEqual([
      'id',
      'company_id',
      'import_id',
      'previous_item_id',
      'previous_attempt',
      'ordinal',
      'source_name',
      'source_object_id',
      'source_sha256',
      'source_entry',
      'variant',
      'access_key',
      'source_nsu',
      'environment',
      'status',
      'attempt',
      'error',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(nfeImportItems)
    expect(uniqueColumnsByName(nfeImportItems)).toMatchObject({
      nfe_import_items_company_id_id_unique: ['company_id', 'id'],
      nfe_import_items_company_id_import_id_ordinal_attempt_unique: [
        'company_id',
        'import_id',
        'ordinal',
        'attempt',
      ],
      nfe_import_items_company_id_import_id_source_attempt_unique: [
        'company_id',
        'import_id',
        'source_sha256',
        'source_entry',
        'attempt',
      ],
    })
    expect(foreignKeys(nfeImportItems)).toContainEqual({
      columns: ['company_id', 'import_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_imports',
      name: 'nfe_import_items_company_import_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(nfeImportItems)).toContainEqual({
      columns: ['company_id', 'source_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'nfe_import_items_company_source_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(requiredColumnNames(nfeImportItems)).toContainAllValues([
      'id',
      'company_id',
      'import_id',
      'ordinal',
      'source_name',
      'source_object_id',
      'source_sha256',
      'source_entry',
      'status',
      'attempt',
      'created_at',
      'updated_at',
    ])
    expect(checkSqlByName(nfeImportItems)).toMatchObject({
      nfe_import_items_ordinal_check: `"nfe_import_items"."ordinal" > 0`,
      nfe_import_items_attempt_check: `"nfe_import_items"."attempt" > 0`,
      nfe_import_items_sha256_check: `"nfe_import_items"."source_sha256" ~ '^[0-9a-f]{64}$'`,
      nfe_import_items_status_check: `"nfe_import_items"."status" in ('pending', 'validating', 'imported', 'duplicated', 'invalid', 'rejected', 'failed')`,
      nfe_import_items_variant_check: `"nfe_import_items"."variant" is null or "nfe_import_items"."variant" in ('complete', 'summary', 'event')`,
      nfe_import_items_access_key_check: `"nfe_import_items"."access_key" is null or "nfe_import_items"."access_key" ~ '^[0-9]{44}$'`,
      nfe_import_items_distribution_source_presence_check: `("nfe_import_items"."source_nsu" is null) = ("nfe_import_items"."environment" is null)`,
      nfe_import_items_source_nsu_check: `"nfe_import_items"."source_nsu" is null or "nfe_import_items"."source_nsu" ~ '^[0-9]{15}$'`,
      nfe_import_items_environment_check: `"nfe_import_items"."environment" is null or "nfe_import_items"."environment" in ('homologation', 'production')`,
    })
    expect(indexDefinitionsByName(nfeImportItems)).toMatchObject({
      nfe_import_items_company_environment_source_nsu_unique: {
        columns: ['company_id', 'environment', 'source_nsu'],
        isUnique: true,
        where: `"nfe_import_items"."source_nsu" is not null`,
      },
    })
  })
})
