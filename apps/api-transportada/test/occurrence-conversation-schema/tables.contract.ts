/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T401 (RF6, RF9, RF14, RF15, RF21): as tabelas da conversa da ocorrência. Toda FK leva
 * `company_id` (a FK simples aceitaria amarrar a conversa de uma empresa à contratante de outra,
 * porque as duas linhas existem), toda tabela nasce ancorada em `companies`, e as regras que a
 * política não pode esquecer — quem é autor em cada direção, o que cada canal consegue confirmar —
 * ficam também no banco.
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversationReads,
  occurrenceConversations,
  occurrenceConversationUnassigned,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const MIGRATIONS = new URL('../../drizzle/', import.meta.url)
const TABLES = [
  ['occurrence_conversations', occurrenceConversations],
  ['occurrence_conversation_messages', occurrenceConversationMessages],
  ['occurrence_conversation_attachments', occurrenceConversationAttachments],
  ['occurrence_conversation_reads', occurrenceConversationReads],
  ['occurrence_conversation_unassigned', occurrenceConversationUnassigned],
] as const

function migrationDirectory(): string {
  const directory = readdirSync(MIGRATIONS).find((name) =>
    name.endsWith('_occurrence_conversations'),
  )
  if (directory === undefined) throw new Error('EXPECTED_MIGRATION')
  return directory
}

describe('as tabelas da conversa da ocorrência (spec 183 T401)', () => {
  test('toda tabela nasce ancorada na empresa, com restrict', () => {
    for (const [name, table] of TABLES) {
      expect(foreignKeys(table)).toContainEqual(
        expect.objectContaining({
          columns: ['company_id'],
          foreignTable: 'companies',
          onDelete: 'restrict',
        }),
      )
      expect(requiredColumnNames(table), name).toContain('company_id')
    }
  })

  test('uma conversa por ocorrência e participante; o public_ref é único na instalação', () => {
    const uniques = uniqueColumnsByName(occurrenceConversations)
    expect(uniques.occurrence_conversations_occurrence_participant_unique).toEqual([
      'company_id',
      'occurrence_kind',
      'occurrence_id',
      'participant',
    ])
    expect(uniques.occurrence_conversations_public_ref_unique).toEqual(['public_ref'])
    expect(uniques.occurrence_conversations_company_id_id_unique).toEqual(['company_id', 'id'])
  })

  test('a contratante e o motorista da conversa ficam dentro da mesma empresa', () => {
    const keys = foreignKeys(occurrenceConversations)
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'contractor_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'contractors',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({ columns: ['driver_user_id'], foreignTable: 'identity_users' }),
    )
  })

  test('conversa com a contratante tem contratante e public_ref; com o motorista, o usuário dele', () => {
    const checks = checkSqlByName(occurrenceConversations)
    expect(checks.occurrence_conversations_participant_check).toContain("'contractor'")
    expect(checks.occurrence_conversations_participant_check).toContain("'driver'")
    expect(checks.occurrence_conversations_occurrence_kind_check).toContain("'stop'")
    expect(checks.occurrence_conversations_occurrence_kind_check).toContain("'document'")
    expect(checks.occurrence_conversations_participant_shape_check).toContain('contractor_id')
    expect(checks.occurrence_conversations_participant_shape_check).toContain('driver_user_id')
    expect(checks.occurrence_conversations_participant_shape_check).toContain('public_ref')
  })

  test('a mensagem pertence a uma conversa da mesma empresa, e o id do provedor é único por canal', () => {
    expect(foreignKeys(occurrenceConversationMessages)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'conversation_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'occurrence_conversations',
      }),
    )
    expect(foreignKeys(occurrenceConversationMessages)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'mail_message_id'],
        foreignTable: 'contractor_mail_messages',
      }),
    )
    expect(foreignKeys(occurrenceConversationMessages)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'contractor_contact_id'],
        foreignTable: 'contractor_contacts',
      }),
    )
    expect(
      uniqueColumnsByName(occurrenceConversationMessages)
        .occurrence_conversation_messages_provider_message_unique,
    ).toEqual(['company_id', 'channel', 'provider_message_id'])
    expect(
      indexColumnsByName(occurrenceConversationMessages)
        .occurrence_conversation_messages_conversation_created_idx,
    ).toEqual(['company_id', 'conversation_id', 'created_at', 'id'])
  })

  test('canal, direção e autor: a enviada é do operador; a recebida tem um autor só', () => {
    const checks = checkSqlByName(occurrenceConversationMessages)
    for (const channel of ['email', 'whatsapp', 'app', 'portal']) {
      expect(checks.occurrence_conversation_messages_channel_check).toContain(`'${channel}'`)
    }
    expect(checks.occurrence_conversation_messages_author_check).toContain('author_user_id')
    expect(checks.occurrence_conversation_messages_author_check).toContain('driver_user_id')
    expect(checks.occurrence_conversation_messages_author_check).toContain('sender_address')
  })

  test('status só na enviada, e cada canal só confirma o que consegue (D7, RF14)', () => {
    const checks = checkSqlByName(occurrenceConversationMessages)
    for (const status of ['queued', 'sent', 'delivered', 'read', 'failed', 'bounced']) {
      expect(checks.occurrence_conversation_messages_status_check).toContain(`'${status}'`)
    }
    expect(checks.occurrence_conversation_messages_status_direction_check).toContain('direction')
    expect(checks.occurrence_conversation_messages_email_never_read_check).toContain("'read'")
    expect(checks.occurrence_conversation_messages_portal_status_check).toContain("'portal'")
  })

  test('o anexo aponta para a mensagem e para o objeto do bucket da mesma empresa, com sha256', () => {
    const keys = foreignKeys(occurrenceConversationAttachments)
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'message_id'],
        foreignTable: 'occurrence_conversation_messages',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'stored_object_id'],
        foreignTable: 'stored_objects',
      }),
    )
    const checks = checkSqlByName(occurrenceConversationAttachments)
    expect(checks.occurrence_conversation_attachments_sha256_check).toContain('[0-9a-f]{64}')
    expect(checks.occurrence_conversation_attachments_size_check).toContain('size_bytes')
  })

  test('a leitura é por usuário e conversa (RF15), uma linha só', () => {
    expect(
      uniqueColumnsByName(occurrenceConversationReads).occurrence_conversation_reads_user_unique,
    ).toEqual(['company_id', 'conversation_id', 'user_id'])
  })

  test('a não atribuída guarda o que chegou, e o status do provedor segue idempotente', () => {
    expect(
      uniqueColumnsByName(occurrenceConversationUnassigned)
        .occurrence_conversation_unassigned_provider_message_unique,
    ).toEqual(['company_id', 'channel', 'provider_message_id'])
    expect(requiredColumnNames(occurrenceConversationUnassigned)).toEqual(
      expect.arrayContaining(['channel', 'sender_address', 'received_at']),
    )
  })

  test('a migration é aditiva e o rollback derruba as cinco tabelas, filhas primeiro', () => {
    const directory = new URL(`${migrationDirectory()}/`, MIGRATIONS)
    expect(readdirSync(directory).sort()).toEqual([
      'migration.sql',
      'rollback.sql',
      'snapshot.json',
    ])
    const migration = readFileSync(new URL('migration.sql', directory), 'utf8')
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu)
    const rollback = readFileSync(new URL('rollback.sql', directory), 'utf8')
    const order = [
      'occurrence_conversation_attachments',
      'occurrence_conversation_reads',
      'occurrence_conversation_unassigned',
      'occurrence_conversation_messages',
      'occurrence_conversations',
    ].map((table) => rollback.indexOf(`DROP TABLE "${table}"`))
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((left, right) => left - right)).toEqual(order)
  })
})
