/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o pedido de upload do anexo da conversa. O arquivo sobe direto ao bucket
 * por URL assinada; a linha guarda quem pediu, para qual conversa e canal, o que foi declarado e até
 * quando vale. Só vira anexo no envio da mensagem, depois de conferido pelos bytes. O objeto final
 * ganha propósito próprio em `stored_objects`.
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  occurrenceConversationUploads,
  STORAGE_OBJECT_PURPOSES,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const MIGRATIONS = new URL('../../drizzle/', import.meta.url)

function migrationFile(file: 'migration.sql' | 'rollback.sql' | 'snapshot.json'): string {
  const directory = readdirSync(MIGRATIONS).find((name) =>
    name.endsWith('_occurrence_conversation_uploads'),
  )
  if (directory === undefined) throw new Error('EXPECTED_MIGRATION')
  return readFileSync(new URL(`${directory}/${file}`, MIGRATIONS), 'utf8')
}

describe('o pedido de upload do anexo da conversa (spec 183 T702a)', () => {
  test('nasce ancorado na empresa e em quem pediu, com restrict', () => {
    const keys = foreignKeys(occurrenceConversationUploads)

    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['requested_by_user_id'],
        foreignTable: 'identity_users',
        onDelete: 'restrict',
      }),
    )
    expect(requiredColumnNames(occurrenceConversationUploads)).toEqual(
      expect.arrayContaining([
        'company_id',
        'occurrence_kind',
        'occurrence_id',
        'participant',
        'channel',
        'requested_by_user_id',
        'bucket',
        'object_key',
        'declared_content_type',
        'declared_size_bytes',
        'status',
        'expires_at',
      ]),
    )
    expectGeneratedUuidPrimaryKey(occurrenceConversationUploads)
  })

  test('as regras moram também no banco', () => {
    const checks = checkSqlByName(occurrenceConversationUploads)

    for (const status of ['pending', 'attached', 'expired']) {
      expect(checks.occurrence_conversation_uploads_status_check).toContain(`'${status}'`)
    }
    expect(checks.occurrence_conversation_uploads_size_check).toContain('> 0')
    expect(checks.occurrence_conversation_uploads_attached_check).toContain('attached_at')
    expect(checks.occurrence_conversation_uploads_file_name_check).toContain('200')
    expect(uniqueColumnsByName(occurrenceConversationUploads)).toMatchObject({
      occurrence_conversation_uploads_object_key_unique: ['object_key'],
    })
    expect(
      indexColumnsByName(occurrenceConversationUploads)
        .occurrence_conversation_uploads_status_expires_idx,
    ).toEqual(['status', 'expires_at'])
  })

  test('o objeto final tem propósito próprio no storage', () => {
    expect(STORAGE_OBJECT_PURPOSES).toContain('occurrence_conversation_attachment')
  })

  test('a migration é aditiva, tem rollback e snapshot', () => {
    const migration = migrationFile('migration.sql')

    expect(migration).toContain('CREATE TABLE "occurrence_conversation_uploads"')
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/u)
    const rollback = migrationFile('rollback.sql')
    expect(rollback).toContain('DROP TABLE IF EXISTS "occurrence_conversation_uploads"')
    expect(rollback).toContain('occurrence_conversation_attachment')
    expect(JSON.parse(migrationFile('snapshot.json'))).toBeTruthy()
  })
})
