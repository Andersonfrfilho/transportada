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

describe('persistent processing schema', () => {
  test('defines a tenant-scoped outbox with attempts, scheduling, claim lease, and publication', () => {
    const processingOutbox = requireSchemaTable('processingOutbox')

    expect(columnNames(processingOutbox)).toEqual([
      'id',
      'company_id',
      'event_id',
      'aggregate_type',
      'aggregate_id',
      'event_type',
      'event_version',
      'actor_user_id',
      'triggered_by',
      'automation_job',
      'correlation_id',
      'payload',
      'attempt',
      'next_attempt_at',
      'claim_owner',
      'claim_expires_at',
      'published_at',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(processingOutbox)
    expect(requiredColumnNames(processingOutbox)).toContainAllValues([
      'id',
      'company_id',
      'event_id',
      'aggregate_type',
      'aggregate_id',
      'event_type',
      'event_version',
      'actor_user_id',
      'triggered_by',
      'correlation_id',
      'payload',
      'attempt',
      'next_attempt_at',
      'created_at',
      'updated_at',
    ])
    expect(uniqueColumnsByName(processingOutbox)).toMatchObject({
      processing_outbox_company_id_id_unique: ['company_id', 'id'],
      processing_outbox_company_id_event_id_unique: ['company_id', 'event_id'],
    })
    expect(indexColumnsByName(processingOutbox)).toMatchObject({
      processing_outbox_company_published_next_attempt_created_idx: [
        'company_id',
        'published_at',
        'next_attempt_at',
        'created_at',
      ],
    })
    expect(foreignKeys(processingOutbox)).toContainEqual({
      columns: ['company_id', 'aggregate_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_imports',
      name: 'processing_outbox_company_aggregate_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(checkSqlByName(processingOutbox)).toMatchObject({
      processing_outbox_attempt_check: `"processing_outbox"."attempt" >= 0`,
      processing_outbox_event_version_check: `"processing_outbox"."event_version" > 0`,
      processing_outbox_aggregate_type_check: `"processing_outbox"."aggregate_type" = 'nfe_import'`,
      processing_outbox_event_type_check: `"processing_outbox"."event_type" in ('transportada.nfe.import.requested', 'transportada.nfe.distribution.requested')`,
      processing_outbox_claim_check: `("processing_outbox"."claim_owner" is null) = ("processing_outbox"."claim_expires_at" is null)`,
    })
  })

  test('deduplicates processed messages by tenant, consumer, and event', () => {
    const processedMessages = requireSchemaTable('processedMessages')

    expect(columnNames(processedMessages)).toEqual([
      'id',
      'company_id',
      'consumer_name',
      'event_id',
      'result',
      'processed_at',
    ])
    expectGeneratedUuidPrimaryKey(processedMessages)
    expect(requiredColumnNames(processedMessages)).toEqual(columnNames(processedMessages))
    expect(columnSqlTypes(processedMessages)).toMatchObject({ result: 'text' })
    expect(uniqueColumnsByName(processedMessages)).toMatchObject({
      processed_messages_company_id_id_unique: ['company_id', 'id'],
      processed_messages_company_consumer_event_unique: ['company_id', 'consumer_name', 'event_id'],
    })
    expect(foreignKeys(processedMessages)).toContainEqual({
      columns: ['company_id', 'event_id'],
      foreignColumns: ['company_id', 'event_id'],
      foreignTable: 'processing_outbox',
      name: 'processed_messages_company_event_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
