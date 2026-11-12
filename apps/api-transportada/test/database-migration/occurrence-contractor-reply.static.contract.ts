/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.1: the contractor reply migration is additive. Thirteen NOT NULL columns with constant
 * defaults on the type, three nullable columns without default on the contractor exception, three new
 * tables with composite company foreign keys, an append-only trigger on the events, and no `UPDATE`
 * (no type is switched on by name). The rollback drops only what this migration created.
 *
 * Tenant safety is proved here on the schema and on the SQL: there is no repository yet, so the
 * repository-text checks of `tenant-safety.contract.ts` arrive with Phase 4.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceContractorReplyEvents,
} from '../../src/database/occurrence-contractor-reply.schema.js'
import {
  OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS,
  OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS,
  OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS,
} from './occurrence-contractor-reply.assertion.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_contractor_reply'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63
const TYPES = '"company_occurrence_types"'
const CONTRACTOR = '"company_occurrence_type_contractor_overrides"'
const NEW_TABLES = [
  'occurrence_contractor_replies',
  'occurrence_contractor_reply_deliveries',
  'occurrence_contractor_reply_events',
] as const

const TYPE_COLUMN_DEFINITIONS = [
  `"contractor_reply_mode" varchar(32) DEFAULT 'off' NOT NULL`,
  `"contractor_reply_attachment_kind" varchar(16) DEFAULT 'pdf' NOT NULL`,
  `"driver_reply_channel" varchar(16) DEFAULT 'app_chat' NOT NULL`,
  `"driver_reply_window_closed_action" varchar(24) DEFAULT 'fallback_app_chat' NOT NULL`,
  `"driver_reply_template" text DEFAULT '' NOT NULL`,
  `"contractor_reply_wait_hours" smallint`,
  `"contractor_reply_alert_mode" varchar(16) DEFAULT 'off' NOT NULL`,
  `"contractor_reply_alert_interval_minutes" smallint DEFAULT 60 NOT NULL`,
  `"contractor_reply_alert_max_count" smallint DEFAULT 24 NOT NULL`,
  `"forward_to_note_recipient" varchar(16) DEFAULT 'off' NOT NULL`,
  `"forward_to_informed_email" varchar(16) DEFAULT 'off' NOT NULL`,
  `"forward_email_subject" text DEFAULT '' NOT NULL`,
  `"forward_email_body" text DEFAULT '' NOT NULL`,
] as const

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_contractor_reply is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('the contractor reply enters additive (spec 248 T3.1)', () => {
  test('every constraint name fits 63 characters', () => {
    const names = [
      ...OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS,
      ...OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS,
    ]
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
    }
    expect(OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS).toHaveLength(11)
  })

  test('constant defaults on the type, nullable and default-free on the exception, CHECKs after, no UPDATE', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    for (const definition of TYPE_COLUMN_DEFINITIONS) {
      expect(instructions).toContain(`ALTER TABLE ${TYPES} ADD COLUMN ${definition};`)
    }
    for (const column of [
      `"contractor_reply_mode" varchar(32)`,
      `"contractor_reply_wait_hours" smallint`,
      `"forward_to_note_recipient" varchar(16)`,
    ]) {
      expect(instructions).toContain(`ALTER TABLE ${CONTRACTOR} ADD COLUMN ${column};`)
    }
    const lastColumn = instructions.lastIndexOf('ADD COLUMN')
    const names = [
      ...OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS,
      ...OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS,
    ]
    for (const name of names) {
      expect(positionOf(instructions, `ADD CONSTRAINT "${name}"`)).toBeGreaterThan(lastColumn)
    }
    expect(instructions.match(/ADD COLUMN/gu)).toHaveLength(16)
    expect(instructions).not.toMatch(/^\s*(UPDATE|DELETE FROM)\b|\bDROP\b|\bCREATE TYPE\b/mu)
    expect(instructions).not.toContain('"nfe_documents"')
  })

  test('the four cross-field CHECKs of the type keep the spec shape', async () => {
    const { text } = await readMigration('migration.sql')

    expect(text).toContain(
      `"company_occurrence_types_contractor_reply_requires_mail_check" CHECK ("contractor_reply_mode" = 'off' or ("emails_contractor" and btrim("driver_reply_template") <> ''))`,
    )
    expect(text).toContain(
      `"company_occurrence_types_contractor_reply_alert_wait_check" CHECK ("contractor_reply_alert_mode" = 'off' or "contractor_reply_wait_hours" is not null)`,
    )
    expect(text).toContain(
      `"company_occurrence_types_forward_automatic_needs_reply_check" CHECK ("forward_to_note_recipient" <> 'automatic' or "contractor_reply_mode" <> 'off')`,
    )
    expect(text).toContain(
      `"company_occurrence_types_forward_needs_text_check" CHECK (("forward_to_note_recipient" = 'off' and "forward_to_informed_email" = 'off') or (btrim("forward_email_subject") <> '' and btrim("forward_email_body") <> ''))`,
    )
  })

  test('the three tables, the append-only trigger and the composite foreign keys are in the SQL', async () => {
    const { text } = await readMigration('migration.sql')

    for (const table of NEW_TABLES) expect(text).toContain(`CREATE TABLE "${table}"`)
    for (const table of NEW_TABLES) {
      const foreignKeys = text
        .split('\n')
        .filter((line) => line.includes(`ALTER TABLE "${table}" ADD CONSTRAINT`))
        .filter((line) => line.includes('FOREIGN KEY'))
      expect(foreignKeys.length).toBeGreaterThanOrEqual(2)
      for (const line of foreignKeys) {
        const columns = /FOREIGN KEY \(([^)]*)\)/u.exec(line)?.[1] ?? ''
        const referenced = /REFERENCES "([^"]+)"/u.exec(line)?.[1] ?? ''
        const isCompany = referenced === 'companies' || referenced === 'identity_users'
        if (!isCompany) expect(columns.startsWith('"company_id",')).toBe(true)
        expect(line).toContain('ON DELETE RESTRICT')
      }
    }
    expect(text).toContain('CREATE FUNCTION "reject_occurrence_contractor_reply_events_mutation"()')
    expect(text).toContain(
      'CREATE TRIGGER "occurrence_contractor_reply_events_append_only_trigger"',
    )
    expect(text).toContain('BEFORE UPDATE OR DELETE ON "occurrence_contractor_reply_events"')
    expect(text).toContain('WHERE "status" = \'pending_window\'')
  })

  test('the schema ties every reference to the company: composite keys, restrict, no cascade', () => {
    for (const table of [
      occurrenceContractorReplies,
      occurrenceContractorReplyDeliveries,
      occurrenceContractorReplyEvents,
    ]) {
      const { foreignKeys, name } = getTableConfig(table)
      expect(NEW_TABLES).toContain(name as (typeof NEW_TABLES)[number])
      for (const foreignKey of foreignKeys) {
        const reference = foreignKey.reference()
        const isCompanyKey = reference.columns.length === 1
        if (isCompanyKey) expect(reference.columns[0]?.name).not.toBe('id')
        expect(foreignKey.onDelete).toBe('restrict')
      }
      const composite = foreignKeys.filter((key) => key.reference().columns.length > 1)
      for (const key of composite) {
        expect(key.reference().columns[0]?.name).toBe('company_id')
        expect(key.reference().foreignColumns[0]?.name).toBe('company_id')
      }
    }
    const replyReferences = getTableConfig(occurrenceContractorReplies).foreignKeys.map(
      (key) => getTableConfig(key.reference().foreignTable).name,
    )
    expect(replyReferences).toEqual(
      expect.arrayContaining([
        'trip_document_occurrences',
        'occurrence_conversations',
        'occurrence_conversation_messages',
        'occurrence_conversation_attachments',
      ]),
    )
  })

  test('the rollback drops the trigger, the tables, the CHECKs, then the columns, then the journal with ROW_COUNT', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      'DROP TRIGGER "occurrence_contractor_reply_events_append_only_trigger"',
      'DROP FUNCTION "reject_occurrence_contractor_reply_events_mutation"()',
      'DROP TABLE "occurrence_contractor_reply_events"',
      'DROP TABLE "occurrence_contractor_reply_deliveries"',
      'DROP TABLE "occurrence_contractor_replies"',
      `DROP CONSTRAINT IF EXISTS "${OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS[0]}"`,
      'DROP COLUMN IF EXISTS "contractor_reply_mode"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    for (const name of [
      ...OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS,
      ...OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS,
    ]) {
      expect(instructions).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`)
    }
    for (const column of OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS) {
      expect(instructions).toContain(`DROP COLUMN IF EXISTS "${column}"`)
    }
    expect(instructions).not.toContain('recipient_email')
    expect(instructions).not.toMatch(/\bCASCADE\b|\bUPDATE\b/u)
    expect(text).toContain('Refusing to roll back')
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
