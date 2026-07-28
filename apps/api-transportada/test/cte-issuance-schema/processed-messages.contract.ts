import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('CT-e processed messages ledger schema', () => {
  test('keys idempotency by company, consumer and event', () => {
    const cteProcessedMessages = requireSchemaTable('cteProcessedMessages')

    expect(getTableConfig(cteProcessedMessages).name).toBe('cte_processed_messages')
    expect(columnNames(cteProcessedMessages)).toEqual([
      'id',
      'company_id',
      'consumer_name',
      'event_id',
      'batch_item_id',
      'attempt_id',
      'result',
      'created_at',
    ])
    expectGeneratedUuidPrimaryKey(cteProcessedMessages)
    expect(requiredColumnNames(cteProcessedMessages)).toEqual(columnNames(cteProcessedMessages))
    expect(columnSqlTypes(cteProcessedMessages)).toMatchObject({
      attempt_id: 'uuid',
      batch_item_id: 'uuid',
      consumer_name: 'text',
      event_id: 'uuid',
      result: 'text',
    })
    expect(uniqueColumnsByName(cteProcessedMessages)).toMatchObject({
      cte_processed_messages_company_consumer_event_unique: [
        'company_id',
        'consumer_name',
        'event_id',
      ],
      cte_processed_messages_company_id_id_unique: ['company_id', 'id'],
    })
  })

  test('references only the company, never an originating outbox', () => {
    const cteProcessedMessages = requireSchemaTable('cteProcessedMessages')
    const references = foreignKeys(cteProcessedMessages)

    expect(references).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'cte_processed_messages_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
    expect(references.map((reference) => reference.foreignTable)).not.toContain('processing_outbox')
    expect(references.map((reference) => reference.foreignTable)).not.toContain(
      'cte_issuance_outbox',
    )
  })
})
