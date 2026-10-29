/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.1: the rollback removes the three reply tables, their trigger function, the CHECKs and
 * the columns this migration added to the type and to the contractor exception, and nothing the
 * earlier specs created on the same tables. It refuses to run while a reply is recorded.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { rollbackClientEmailFallbackFrom } from './client-email-fallback-from.assertion.js'
import { rollbackClientWhatsAppAutomatic } from './client-whatsapp-automatic.assertion.js'
import { rollbackContractorReplyAcknowledgement } from './contractor-reply-acknowledgement.assertion.js'
import { rollbackClientEmailSendMode } from './client-email-send-mode.assertion.js'
import { rollbackContractorReplyClientBoletoEmails } from './contractor-reply-client-boleto-emails.assertion.js'
import { rollbackContractorReplyWhatsAppDelivery } from './contractor-reply-whatsapp-delivery.assertion.js'
import { rollbackContractorReplyEventDocumentReasons } from './contractor-reply-event-document-reasons.assertion.js'
import { rollbackContractorReplyResolveOnDelivery } from './contractor-reply-resolve-on-delivery.assertion.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { rollbackOccurrenceDropForwardEmail } from './occurrence-drop-forward-email.assertion.js'
import { OCCURRENCE_CONTRACTOR_REPLY_TABLES, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_contractor_reply'

export const OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS = [
  'contractor_reply_alert_interval_minutes',
  'contractor_reply_alert_max_count',
  'contractor_reply_alert_mode',
  'contractor_reply_attachment_kind',
  'contractor_reply_mode',
  'contractor_reply_wait_hours',
  'driver_reply_channel',
  'driver_reply_template',
  'driver_reply_window_closed_action',
  'forward_to_informed_email',
  'forward_to_note_recipient',
] as const

export const OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_COLUMNS = [
  'contractor_reply_mode',
  'contractor_reply_wait_hours',
  'forward_to_note_recipient',
] as const

export const OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS = [
  'company_occurrence_types_contractor_reply_mode_check',
  'company_occurrence_types_contractor_reply_attachment_kind_check',
  'company_occurrence_types_driver_reply_channel_check',
  'company_occurrence_types_driver_reply_window_action_check',
  'company_occurrence_types_driver_reply_template_check',
  'company_occurrence_types_contractor_reply_wait_hours_check',
  'company_occurrence_types_contractor_reply_alert_mode_check',
  'company_occurrence_types_contractor_reply_alert_interval_check',
  'company_occurrence_types_contractor_reply_alert_max_count_check',
  'company_occurrence_types_forward_to_note_recipient_check',
  'company_occurrence_types_forward_to_informed_email_check',
  'company_occurrence_types_contractor_reply_requires_mail_check',
  'company_occurrence_types_contractor_reply_alert_wait_check',
  'company_occurrence_types_forward_automatic_needs_reply_check',
] as const

export const OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS = [
  'occurrence_type_contractor_overrides_reply_mode_check',
  'occurrence_type_contractor_overrides_reply_wait_hours_check',
  'occurrence_type_contractor_overrides_forward_note_check',
] as const

export type OccurrenceContractorReplyProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function readTables(database: SQL): Promise<string[]> {
  const rows = (await database`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ${database(OCCURRENCE_CONTRACTOR_REPLY_TABLES)}
  `) as { table_name: string }[]
  return rows.map((row) => row.table_name).toSorted()
}

async function readColumnCount(database: SQL): Promise<number> {
  const rows = (await database`
    select column_name from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'company_occurrence_types'
            and column_name in ${database(OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS)})
        or (table_name = 'company_occurrence_type_contractor_overrides'
            and column_name in ${database(OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_COLUMNS)}))
  `) as unknown[]
  return rows.length
}

async function readConstraintCount(database: SQL): Promise<number> {
  const names = [
    ...OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS,
    ...OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS,
  ]
  const rows = (await database`
    select conname from pg_constraint where conname in ${database(names)}
  `) as unknown[]
  return rows.length
}

async function hasTriggerFunction(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from pg_proc where proname = 'reject_occurrence_contractor_reply_events_mutation'
  `) as unknown[]
  return rows.length === 1
}

export async function assertOccurrenceContractorReplyRollback(
  probe: OccurrenceContractorReplyProbe,
): Promise<void> {
  const { connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_contractor_reply is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const expectedColumns =
    OCCURRENCE_CONTRACTOR_REPLY_TYPE_COLUMNS.length +
    OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_COLUMNS.length
  const expectedConstraints =
    OCCURRENCE_CONTRACTOR_REPLY_TYPE_CONSTRAINTS.length +
    OCCURRENCE_CONTRACTOR_REPLY_OVERRIDE_CONSTRAINTS.length
  expect(await readTables(database)).toEqual([...OCCURRENCE_CONTRACTOR_REPLY_TABLES].toSorted())
  expect(await readColumnCount(database)).toBe(expectedColumns)
  expect(await readConstraintCount(database)).toBe(expectedConstraints)
  expect(await hasTriggerFunction(database)).toBe(true)

  await rollbackOccurrenceDropForwardEmail(database, probe.directories)
  await rollbackClientEmailFallbackFrom(database, probe.directories)
  await rollbackClientWhatsAppAutomatic(database, probe.directories)
  await rollbackContractorReplyWhatsAppDelivery(database, probe.directories)
  await rollbackClientEmailSendMode(database, probe.directories)
  await rollbackContractorReplyClientBoletoEmails(database, probe.directories)

  await rollbackContractorReplyEventDocumentReasons(database, probe.directories)
  await rollbackContractorReplyAcknowledgement(database, probe.directories)
  await rollbackContractorReplyResolveOnDelivery(database, probe.directories)
  await database.unsafe(rollback)

  expect(await readTables(database)).toEqual([])
  expect(await readColumnCount(database)).toBe(0)
  expect(await readConstraintCount(database)).toBe(0)
  expect(await hasTriggerFunction(database)).toBe(false)
  const journal = (await database`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `) as unknown[]
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString })

  expect(await readTables(database)).toEqual([...OCCURRENCE_CONTRACTOR_REPLY_TABLES].toSorted())
  expect(await readColumnCount(database)).toBe(expectedColumns)
}
