/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 H1: a trilha das mudanças de status da nota. A máquina D4 e a idempotência D7 ficam no
 * banco, não na disciplina do worker.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { indexDefinitionsByName } from './support.js'
import { requireSchemaTable } from './tables.js'

describe('NF-e document status change trail schema', () => {
  test('keeps one row per reached status, tenant-bound to the document, event, and import', () => {
    const changes = requireSchemaTable('nfeDocumentStatusChanges')

    expect(columnNames(changes)).toEqual([
      'id',
      'company_id',
      'document_id',
      'status_before',
      'status_after',
      'cause',
      'event_id',
      'import_id',
      'origin',
      'actor_user_id',
      'requested_by_user_id',
      'changed_at',
    ])
    expect(requiredColumnNames(changes)).toEqual([
      'id',
      'company_id',
      'document_id',
      'status_before',
      'status_after',
      'cause',
      'changed_at',
    ])
    expect(columnSqlTypes(changes)).toMatchObject({
      status_before: 'varchar(16)',
      status_after: 'varchar(16)',
      cause: 'varchar(16)',
      event_id: 'uuid',
      import_id: 'uuid',
      origin: 'varchar(16)',
      actor_user_id: 'uuid',
      requested_by_user_id: 'uuid',
      changed_at: 'timestamp with time zone',
    })
    const changedAt = getTableConfig(changes).columns.find((column) => column.name === 'changed_at')
    expect(changedAt?.hasDefault).toBeTrue()
    expect(changedAt?.notNull).toBeTrue()
    expectGeneratedUuidPrimaryKey(changes)

    expect(uniqueColumnsByName(changes)).toEqual({
      nfe_document_status_changes_company_id_id_unique: ['company_id', 'id'],
      nfe_document_status_changes_document_target_unique: [
        'company_id',
        'document_id',
        'status_after',
      ],
    })
    expect(indexDefinitionsByName(changes)).toEqual({
      nfe_document_status_changes_company_document_changed_id_idx: {
        columns: ['company_id', 'document_id', 'changed_at', 'id'],
        isUnique: false,
        where: undefined,
      },
    })
    const orderedColumns = getTableConfig(changes)
      .indexes.flatMap((tableIndex) => tableIndex.config.columns)
      .map((column) => [
        'name' in column ? column.name : '',
        'indexConfig' in column ? (column.indexConfig?.order ?? 'asc') : 'asc',
      ])
    expect(orderedColumns).toEqual([
      ['company_id', 'asc'],
      ['document_id', 'asc'],
      ['changed_at', 'desc'],
      ['id', 'desc'],
    ])

    const restrictCascade = { onDelete: 'restrict', onUpdate: 'cascade' }
    expect(foreignKeys(changes)).toContainEqual({
      columns: ['company_id', 'document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_documents',
      name: 'nfe_document_status_changes_company_document_fk',
      ...restrictCascade,
    })
    expect(foreignKeys(changes)).toContainEqual({
      columns: ['company_id', 'event_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_events',
      name: 'nfe_document_status_changes_company_event_fk',
      ...restrictCascade,
    })
    expect(foreignKeys(changes)).toContainEqual({
      columns: ['company_id', 'import_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_imports',
      name: 'nfe_document_status_changes_company_import_fk',
      ...restrictCascade,
    })
    expect(foreignKeys(changes)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        ...restrictCascade,
      }),
    )
    expect(foreignKeys(changes)).toHaveLength(4)

    expect(unqualifiedCheckSqlByName(changes)).toEqual({
      nfe_document_status_changes_status_check: `"status_before" in ('authorized', 'cancelled', 'denied', 'unsigned') and "status_after" in ('authorized', 'cancelled', 'denied', 'unsigned')`,
      nfe_document_status_changes_transition_check: `("status_before", "status_after") in (('authorized', 'cancelled'), ('unsigned', 'cancelled'), ('unsigned', 'denied'))`,
      nfe_document_status_changes_cause_check: `"cause" in ('event', 'summary', 'document_insert')`,
      nfe_document_status_changes_event_presence_check: `("cause" = 'summary') = ("event_id" is null)`,
      nfe_document_status_changes_origin_check: `"origin" is null or "origin" in ('manual', 'automatic')`,
      nfe_document_status_changes_origin_actor_check: `("origin" is null and "actor_user_id" is null and "requested_by_user_id" is null) or ("origin" = 'manual' and "actor_user_id" is not null and "requested_by_user_id" is null) or ("origin" = 'automatic' and "actor_user_id" is null)`,
      nfe_document_status_changes_origin_import_check: `("origin" is null) = ("import_id" is null)`,
    })
  })
})
