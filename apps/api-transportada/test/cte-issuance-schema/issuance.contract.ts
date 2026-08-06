import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

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

describe('CT-e issuance schema', () => {
  test('defines attempts with tenant-scoped idempotency and fiscal numbering lineage', () => {
    const cteIssuanceAttempts = requireSchemaTable('cteIssuanceAttempts')

    expect(columnNames(cteIssuanceAttempts)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'batch_item_id',
      'attempt_kind',
      'attempt_number',
      'status',
      'idempotency_key',
      'idempotency_fingerprint',
      'request_fingerprint',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'reservation_id',
      'last_error_code',
      'last_error_cause',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(cteIssuanceAttempts)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'batch_item_id',
      'attempt_kind',
      'attempt_number',
      'status',
      'idempotency_key',
      'idempotency_fingerprint',
      'request_fingerprint',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'reservation_id',
      'correlation_id',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(cteIssuanceAttempts)
    expect(uniqueColumnsByName(cteIssuanceAttempts)).toMatchObject({
      cte_issuance_attempts_company_id_id_unique: ['company_id', 'id'],
      cte_issuance_attempts_company_item_kind_fingerprint_unique: [
        'company_id',
        'batch_item_id',
        'attempt_kind',
        'request_fingerprint',
      ],
      cte_issuance_attempts_company_idempotency_key_unique: ['company_id', 'idempotency_key'],
    })
    expect(indexColumnsByName(cteIssuanceAttempts)).toMatchObject({
      cte_issuance_attempts_company_status_created_at_idx: ['company_id', 'status', 'created_at'],
    })
    expect(checkSqlByName(cteIssuanceAttempts)).toMatchObject({
      cte_issuance_attempts_status_check:
        "\"cte_issuance_attempts\".\"status\" in ('pending', 'in_flight', 'authorized', 'rejected', 'retry_scheduled', 'failed', 'reconciliation_required', 'cancelled')",
      cte_issuance_attempts_kind_check:
        "\"cte_issuance_attempts\".\"attempt_kind\" in ('issue', 'reprocess', 'cancel')",
      cte_issuance_attempts_attempt_number_check: '"cte_issuance_attempts"."attempt_number" > 0',
      cte_issuance_attempts_environment_check:
        '"cte_issuance_attempts"."fiscal_environment" in (\'homologation\', \'production\')',
      cte_issuance_attempts_fiscal_number_check: '"cte_issuance_attempts"."fiscal_number" > 0',
      cte_issuance_attempts_idempotency_key_check:
        'length("cte_issuance_attempts"."idempotency_key") > 0',
      cte_issuance_attempts_request_fingerprint_check:
        'length("cte_issuance_attempts"."request_fingerprint") > 0',
    })
    expect(foreignKeys(cteIssuanceAttempts)).toContainEqual({
      columns: ['company_id', 'batch_item_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batch_items',
      name: 'cte_issuance_attempts_company_batch_item_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(cteIssuanceAttempts)).toContainEqual({
      columns: ['company_id', 'reservation_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fiscal_sequence_reservations',
      name: 'cte_issuance_attempts_company_reservation_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('defines authorized document metadata without raw fiscal payloads', () => {
    const cteFiscalDocuments = requireSchemaTable('cteFiscalDocuments')

    expect(columnNames(cteFiscalDocuments)).toContainAllValues([
      'id',
      'company_id',
      'batch_item_id',
      'attempt_id',
      'access_key',
      'authorization_protocol',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'status',
      'xml_object_id',
      'xml_sha256',
      'authorized_at',
      'cancellation_justification',
      'cancellation_requested_at',
      'cancellation_protocol',
      'cancelled_at',
      'cancellation_xml_object_id',
      'cancellation_xml_sha256',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(cteFiscalDocuments)).toMatchObject({
      fiscal_number: 'bigint',
    })
    expectGeneratedUuidPrimaryKey(cteFiscalDocuments)
    expect(requiredColumnNames(cteFiscalDocuments)).toContainAllValues([
      'id',
      'company_id',
      'batch_item_id',
      'attempt_id',
      'access_key',
      'authorization_protocol',
      'fiscal_environment',
      'fiscal_series',
      'fiscal_number',
      'status',
      'xml_object_id',
      'xml_sha256',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(cteFiscalDocuments)).toMatchObject({
      cte_fiscal_documents_company_id_id_unique: ['company_id', 'id'],
      cte_fiscal_documents_company_access_key_unique: ['company_id', 'access_key'],
      cte_fiscal_documents_company_batch_item_unique: ['company_id', 'batch_item_id'],
    })
    expect(checkSqlByName(cteFiscalDocuments)).toMatchObject({
      cte_fiscal_documents_access_key_check:
        '"cte_fiscal_documents"."access_key" ~ \'^[0-9]{44}$\'',
      cte_fiscal_documents_status_check:
        '"cte_fiscal_documents"."status" in (\'authorized\', \'cancelled\')',
      cte_fiscal_documents_environment_check:
        '"cte_fiscal_documents"."fiscal_environment" in (\'homologation\', \'production\')',
      cte_fiscal_documents_sha256_check: '"cte_fiscal_documents"."xml_sha256" ~ \'^[0-9a-f]{64}$\'',
    })
    expect(
      columnNames(cteFiscalDocuments).filter((columnName) => columnName.includes('xml')),
    ).toEqual([
      'xml_object_id',
      'xml_sha256',
      'cancellation_xml_object_id',
      'cancellation_xml_sha256',
    ])
    expect(foreignKeys(cteFiscalDocuments)).toContainEqual({
      columns: ['company_id', 'xml_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'cte_fiscal_documents_company_xml_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('defines one transmittable payload per attempt without certificate material', () => {
    const cteIssuancePayloads = requireSchemaTable('cteIssuancePayloads')

    expect(columnNames(cteIssuancePayloads)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'batch_item_id',
      'attempt_id',
      'payload',
      'provider_config',
      'payload_sha256',
      'created_at',
    ])
    expect(requiredColumnNames(cteIssuancePayloads)).toContainAllValues([
      'id',
      'company_id',
      'batch_id',
      'batch_item_id',
      'attempt_id',
      'payload',
      'provider_config',
      'payload_sha256',
      'created_at',
    ])
    expect(columnSqlTypes(cteIssuancePayloads)).toMatchObject({
      payload: 'jsonb',
      provider_config: 'jsonb',
    })
    expectGeneratedUuidPrimaryKey(cteIssuancePayloads)
    expect(uniqueColumnsByName(cteIssuancePayloads)).toMatchObject({
      cte_issuance_payloads_company_id_id_unique: ['company_id', 'id'],
      cte_issuance_payloads_company_attempt_unique: ['company_id', 'attempt_id'],
    })
    expect(indexColumnsByName(cteIssuancePayloads)).toMatchObject({
      cte_issuance_payloads_company_batch_item_created_at_idx: [
        'company_id',
        'batch_item_id',
        'created_at',
      ],
    })
    expect(checkSqlByName(cteIssuancePayloads)).toMatchObject({
      cte_issuance_payloads_sha256_check:
        '"cte_issuance_payloads"."payload_sha256" ~ \'^[0-9a-f]{64}$\'',
    })
    expect(foreignKeys(cteIssuancePayloads)).toContainEqual({
      columns: ['company_id', 'attempt_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_issuance_attempts',
      name: 'cte_issuance_payloads_company_attempt_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(cteIssuancePayloads)).toContainEqual({
      columns: ['company_id', 'batch_item_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_batch_items',
      name: 'cte_issuance_payloads_company_batch_item_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(
      columnNames(cteIssuancePayloads).filter(
        (columnName) => columnName.includes('certificate') || columnName.includes('password'),
      ),
    ).toEqual([])
  })

  test('defines append-only events and retry schedules scoped by tenant and attempt', () => {
    const cteIssuanceEvents = requireSchemaTable('cteIssuanceEvents')
    const cteRetrySchedules = requireSchemaTable('cteRetrySchedules')

    expect(columnNames(cteIssuanceEvents)).toContainAllValues([
      'id',
      'company_id',
      'attempt_id',
      'batch_item_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(cteIssuanceEvents)
    expect(requiredColumnNames(cteIssuanceEvents)).toContainAllValues([
      'id',
      'company_id',
      'attempt_id',
      'batch_item_id',
      'event_name',
      'payload',
      'occurred_at',
      'created_at',
    ])
    expect(checkSqlByName(cteIssuanceEvents)).toMatchObject({
      cte_issuance_events_name_check:
        "\"cte_issuance_events\".\"event_name\" in ('issue_requested', 'cancel_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled', 'fiscal_number_advanced')",
    })

    expect(columnNames(cteRetrySchedules)).toContainAllValues([
      'id',
      'company_id',
      'attempt_id',
      'batch_item_id',
      'status',
      'attempt_count',
      'max_attempts',
      'next_attempt_at',
      'last_error_cause',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(cteRetrySchedules)
    expect(requiredColumnNames(cteRetrySchedules)).toContainAllValues([
      'id',
      'company_id',
      'attempt_id',
      'batch_item_id',
      'status',
      'attempt_count',
      'max_attempts',
      'next_attempt_at',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(cteRetrySchedules)).toMatchObject({
      cte_retry_schedules_company_attempt_unique: ['company_id', 'attempt_id'],
    })
    expect(checkSqlByName(cteRetrySchedules)).toMatchObject({
      cte_retry_schedules_status_check:
        "\"cte_retry_schedules\".\"status\" in ('scheduled', 'claimed', 'exhausted', 'cancelled')",
      cte_retry_schedules_attempt_count_check: '"cte_retry_schedules"."attempt_count" >= 0',
      cte_retry_schedules_max_attempts_check: '"cte_retry_schedules"."max_attempts" > 0',
    })

    for (const table of [cteIssuanceEvents, cteRetrySchedules]) {
      const tableName = getTableConfig(table).name

      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'attempt_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'cte_issuance_attempts',
        name: `${tableName}_company_attempt_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })
})
