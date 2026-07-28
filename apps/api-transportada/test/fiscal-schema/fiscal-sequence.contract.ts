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
} from './support.js'
import { fiscalSequenceReservations, fiscalSequences, idempotencyRecords } from './tables.js'

describe('tenant fiscal schema', () => {
  test('keeps sequences positive, tenant-scoped, and coherent after reservations', () => {
    expect(columnNames(fiscalSequences)).toEqual([
      'id',
      'company_id',
      'environment',
      'model',
      'series',
      'next_number',
      'last_reserved_number',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(fiscalSequences)).toEqual([
      'id',
      'company_id',
      'environment',
      'model',
      'series',
      'next_number',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(fiscalSequences)).toEqual({
      id: 'uuid',
      company_id: 'uuid',
      environment: 'text',
      model: 'text',
      series: 'bigint',
      next_number: 'bigint',
      last_reserved_number: 'bigint',
      version: 'bigint',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(fiscalSequences)
    expect(uniqueColumnsByName(fiscalSequences)).toEqual({
      fiscal_sequences_company_id_environment_model_series_unique: [
        'company_id',
        'environment',
        'model',
        'series',
      ],
      fiscal_sequences_company_id_id_unique: ['company_id', 'id'],
    })
    expect(checkSqlByName(fiscalSequences)).toEqual({
      fiscal_sequences_environment_check: `"fiscal_sequences"."environment" in ('homologation', 'production')`,
      fiscal_sequences_model_check: `"fiscal_sequences"."model" in ('cte', 'mdfe')`,
      fiscal_sequences_number_coherence_check: `"fiscal_sequences"."next_number" > 0 and ("fiscal_sequences"."last_reserved_number" is null or ("fiscal_sequences"."last_reserved_number" > 0 and "fiscal_sequences"."next_number" = "fiscal_sequences"."last_reserved_number" + 1))`,
      fiscal_sequences_series_check: `"fiscal_sequences"."series" > 0`,
      fiscal_sequences_version_check: `"fiscal_sequences"."version" > 0`,
    })
  })

  test('uses a composite tenant foreign key for the append-only reservation ledger', () => {
    expect(columnNames(fiscalSequenceReservations)).toEqual([
      'id',
      'company_id',
      'fiscal_sequence_id',
      'reservation_key',
      'number',
      'created_at',
    ])
    expect(requiredColumnNames(fiscalSequenceReservations)).toEqual(
      columnNames(fiscalSequenceReservations),
    )
    expect(columnSqlTypes(fiscalSequenceReservations)).toEqual({
      id: 'uuid',
      company_id: 'uuid',
      fiscal_sequence_id: 'uuid',
      reservation_key: 'text',
      number: 'bigint',
      created_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(fiscalSequenceReservations)
    expect(uniqueColumnsByName(fiscalSequenceReservations)).toEqual({
      fiscal_sequence_reservations_company_id_id_unique: ['company_id', 'id'],
      fiscal_sequence_reservations_company_id_reservation_key_unique: [
        'company_id',
        'reservation_key',
      ],
      fiscal_sequence_reservations_sequence_id_number_unique: ['fiscal_sequence_id', 'number'],
    })
    expect(checkSqlByName(fiscalSequenceReservations)).toEqual({
      fiscal_sequence_reservations_number_check: `"fiscal_sequence_reservations"."number" > 0`,
    })
    expect(foreignKeys(fiscalSequenceReservations)).toEqual([
      {
        columns: ['company_id', 'fiscal_sequence_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'fiscal_sequences',
        name: 'fiscal_sequence_reservations_company_sequence_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
    expect(indexColumnsByName(fiscalSequenceReservations)).toMatchObject({
      fiscal_sequence_reservations_company_id_sequence_id_idx: ['company_id', 'fiscal_sequence_id'],
    })
  })

  test('scopes idempotency keys and stores no request payload', () => {
    expect(columnNames(idempotencyRecords)).toEqual([
      'company_id',
      'operation',
      'idempotency_key',
      'request_fingerprint',
      'status',
      'response',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(idempotencyRecords)).toEqual(columnNames(idempotencyRecords))
    expect(columnSqlTypes(idempotencyRecords)).toEqual({
      company_id: 'uuid',
      operation: 'text',
      idempotency_key: 'text',
      request_fingerprint: 'text',
      status: 'text',
      response: 'jsonb',
      created_at: 'timestamp with time zone',
      updated_at: 'timestamp with time zone',
    })
    expect(uniqueColumnsByName(idempotencyRecords)).toEqual({
      idempotency_records_company_id_operation_idempotency_key_unique: [
        'company_id',
        'operation',
        'idempotency_key',
      ],
    })
    expect(indexColumnsByName(idempotencyRecords)).toMatchObject({
      idempotency_records_company_id_created_at_idx: ['company_id', 'created_at'],
    })
    expect(columnNames(idempotencyRecords)).not.toContain('request')
    expect(columnNames(idempotencyRecords)).not.toContain('request_payload')
  })
})
