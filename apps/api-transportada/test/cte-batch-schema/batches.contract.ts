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
import { CTE_BATCH_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_CTE_BATCH_COLUMNS = [
  'xml',
  'xml_content',
  'xml_payload',
  'request_payload',
  'certificate_password',
  'private_key',
]

describe('CT-e batch schema', () => {
  test('defines tenant-owned tables and idempotency keys', () => {
    const cteBatches = requireSchemaTable('cteBatches')
    const cteBatchItems = requireSchemaTable('cteBatchItems')
    const cteBatchEvents = requireSchemaTable('cteBatchEvents')
    const cteSubmissionRecords = requireSchemaTable('cteSubmissionRecords')

    expect(CTE_BATCH_SCHEMA_EXPORT_NAMES).toContain('cteBatches')
    expect(CTE_BATCH_SCHEMA_EXPORT_NAMES).toContain('cteBatchItems')
    expect(CTE_BATCH_SCHEMA_EXPORT_NAMES).toContain('cteBatchEvents')
    expect(CTE_BATCH_SCHEMA_EXPORT_NAMES).toContain('cteSubmissionRecords')

    expect(columnNames(cteBatches)).toContainAllValues([
      'id',
      'company_id',
      'operator_user_id',
      'name',
      'status',
      'version',
      'idempotency_key',
      'idempotency_fingerprint',
      'correlation_id',
      'created_at',
      'updated_at',
    ])

    expect(columnNames(cteBatchItems)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'nfe_document_id',
      'freight_calculation_id',
      'calculation_snapshot',
      'position',
      'created_at',
      'updated_at',
    ])

    expect(columnNames(cteBatchEvents)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])

    expect(columnNames(cteSubmissionRecords)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'idempotency_key',
      'request_fingerprint',
      'result',
      'submission_status',
      'created_at',
    ])

    expect(requiredColumnNames(cteBatches)).toContainAllValues([
      'id',
      'company_id',
      'operator_user_id',
      'name',
      'status',
      'version',
      'idempotency_key',
      'idempotency_fingerprint',
      'correlation_id',
      'created_at',
      'updated_at',
    ])

    expect(requiredColumnNames(cteBatchItems)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'nfe_document_id',
      'freight_calculation_id',
      'calculation_snapshot',
      'position',
      'created_at',
      'updated_at',
    ])

    expect(requiredColumnNames(cteBatchEvents)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])

    expect(requiredColumnNames(cteSubmissionRecords)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'idempotency_key',
      'request_fingerprint',
      'submission_status',
      'created_at',
    ])

    for (const table of [cteBatches, cteBatchItems, cteBatchEvents, cteSubmissionRecords]) {
      expectGeneratedUuidPrimaryKey(table)
    }

    expect(uniqueColumnsByName(cteBatches)).toMatchObject({
      cte_batches_company_id_id_unique: ['company_id', 'id'],
      cte_batches_company_id_name_unique: ['company_id', 'name'],
      cte_batches_company_id_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(uniqueColumnsByName(cteBatchItems)).toMatchObject({
      cte_batch_items_company_id_id_unique: ['company_id', 'id'],
      cte_batch_items_company_id_batch_id_nfe_unique: ['company_id', 'batch_id', 'nfe_document_id'],
    })
    expect(uniqueColumnsByName(cteBatchEvents)).toMatchObject({
      cte_batch_events_company_id_id_unique: ['company_id', 'id'],
    })
    expect(uniqueColumnsByName(cteSubmissionRecords)).toMatchObject({
      cte_submission_records_company_id_id_unique: ['company_id', 'id'],
      cte_submission_records_company_id_batch_id_idempotency_key_unique: [
        'company_id',
        'batch_id',
        'idempotency_key',
      ],
    })

    expect(foreignKeys(cteBatchItems)).toContainEqual({
      columns: ['company_id', 'batch_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batches',
      name: 'cte_batch_items_company_batch_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })

    expect(foreignKeys(cteBatchEvents)).toContainEqual({
      columns: ['company_id', 'batch_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batches',
      name: 'cte_batch_events_company_batch_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })

    expect(foreignKeys(cteSubmissionRecords)).toContainEqual({
      columns: ['company_id', 'batch_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batches',
      name: 'cte_submission_records_company_batch_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })

    const allColumnNames = CTE_BATCH_SCHEMA_EXPORT_NAMES.flatMap((name) =>
      columnNames(requireSchemaTable(name)),
    )
    for (const forbiddenColumn of FORBIDDEN_CTE_BATCH_COLUMNS) {
      expect(allColumnNames).not.toContain(forbiddenColumn)
    }
  })

  test('indexes the cross batch keyset the CT-e listing pages by', () => {
    const indexes = getTableConfig(requireSchemaTable('cteBatchItems')).indexes.map((index) => ({
      columns: index.config.columns.map((column) => (column as { readonly name: string }).name),
      name: index.config.name,
    }))

    expect(indexes).toContainEqual({
      columns: ['company_id', 'created_at', 'id'],
      name: 'cte_batch_items_company_created_at_id_idx',
    })
  })

  test('enforces critical business checks for idempotency, state, and snapshots', () => {
    const cteBatches = requireSchemaTable('cteBatches')
    const cteSubmissionRecords = requireSchemaTable('cteSubmissionRecords')

    expect(checkSqlByName(cteBatches)).toMatchObject({
      cte_batches_status_check:
        "\"cte_batches\".\"status\" in ('draft', 'submitted', 'in_flight', 'done', 'error', 'cancelled')",
      cte_batches_version_check: '"cte_batches"."version" > 0',
    })

    expect(checkSqlByName(cteSubmissionRecords)).toMatchObject({
      cte_submission_records_submission_status_check:
        "\"cte_submission_records\".\"submission_status\" in ('pending', 'accepted', 'conflict', 'rejected')",
      cte_submission_records_result_check:
        '"cte_submission_records"."result" is null or "cte_submission_records"."result" in (\'ok\', \'error\')',
    })
  })
})
