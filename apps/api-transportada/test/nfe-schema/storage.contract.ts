import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('fiscal stored object schema', () => {
  test('tracks immutable tenant objects and a recoverable staging lease without storing content', () => {
    const storedObjects = requireSchemaTable('storedObjects')

    expect(columnNames(storedObjects)).toEqual([
      'id',
      'company_id',
      'provider',
      'bucket',
      'object_key',
      'mime_type',
      'size_bytes',
      'sha256',
      'status',
      'purpose',
      'retention_until',
      'lease_owner',
      'lease_expires_at',
      'deleted_at',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(storedObjects)).toMatchObject({
      id: 'uuid',
      company_id: 'uuid',
      size_bytes: 'bigint',
      retention_until: 'timestamp with time zone',
      lease_expires_at: 'timestamp with time zone',
      deleted_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(storedObjects)
    expect(requiredColumnNames(storedObjects)).toContainAllValues([
      'id',
      'company_id',
      'provider',
      'bucket',
      'object_key',
      'mime_type',
      'size_bytes',
      'sha256',
      'status',
      'purpose',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(storedObjects)).toMatchObject({
      stored_objects_company_id_id_unique: ['company_id', 'id'],
      stored_objects_company_provider_bucket_key_unique: [
        'company_id',
        'provider',
        'bucket',
        'object_key',
      ],
    })
    expect(indexColumnsByName(storedObjects)).toMatchObject({
      stored_objects_company_status_lease_expires_idx: ['company_id', 'status', 'lease_expires_at'],
    })
    expect(checkSqlByName(storedObjects)).toMatchObject({
      stored_objects_size_check: `"stored_objects"."size_bytes" >= 0`,
      stored_objects_sha256_check: `"stored_objects"."sha256" ~ '^[0-9a-f]{64}$'`,
      stored_objects_status_check: `"stored_objects"."status" in ('staging', 'final', 'deleted')`,
      stored_objects_purpose_check: `"stored_objects"."purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof')`,
      stored_objects_lease_check: `("stored_objects"."lease_owner" is null) = ("stored_objects"."lease_expires_at" is null)`,
      stored_objects_deleted_check: `("stored_objects"."status" = 'deleted') = ("stored_objects"."deleted_at" is not null)`,
      stored_objects_final_lease_check: `"stored_objects"."status" <> 'final' or ("stored_objects"."lease_owner" is null and "stored_objects"."lease_expires_at" is null)`,
    })
    expect(columnNames(storedObjects)).not.toContain('content')
    expect(columnNames(storedObjects)).not.toContain('xml')
  })
})
