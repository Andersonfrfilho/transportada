/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.2: a migration do retorno à contratante contra o Postgres real. Um tipo gravado antes
 * dela recebe os padrões sem `UPDATE`; depois, as CHECKs do tipo e as das três tabelas. Roda antes do
 * rollback da mesma migration e deixa o banco como encontrou.
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
import {
  createContractorReplyFixture,
  removeContractorReplyFixture,
} from './occurrence-contractor-reply.fixture.js'
import { assertOccurrenceContractorReplyRows } from './occurrence-contractor-reply-rows.assertion.js'
import { assertOccurrenceContractorReplyTypeConstraints } from './occurrence-contractor-reply-type.assertion.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_contractor_reply'
const DROP_FORWARD_EMAIL_SUFFIX = '_occurrence_drop_forward_email'

async function rollbackOccurrenceDropForwardEmail(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(DROP_FORWARD_EMAIL_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
}

export type OccurrenceContractorReplyConstraintsProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

async function assertDefaultsOnExistingType(
  probe: OccurrenceContractorReplyConstraintsProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_contractor_reply is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  /**
   * A drop de forward_email_* (286 etapa B) é a mais nova: desfaz-se primeiro. Sem isso, reaplicar a 248 recria a
   * CHECK do texto do encaminhamento com a migration de drop já marcada como aplicada, e ela nunca roda de novo.
   */
  await rollbackOccurrenceDropForwardEmail(database, directories)
  await rollbackClientEmailFallbackFrom(database, directories)
  await rollbackClientWhatsAppAutomatic(database, directories)
  await rollbackContractorReplyWhatsAppDelivery(database, directories)
  await rollbackClientEmailSendMode(database, directories)
  await rollbackContractorReplyClientBoletoEmails(database, directories)

  await rollbackContractorReplyEventDocumentReasons(database, directories)
  await rollbackContractorReplyAcknowledgement(database, directories)
  await rollbackContractorReplyResolveOnDelivery(database, directories)
  await database.unsafe(rollback)
  const typeId = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, items_mode, redelivery_policy)
    values (${typeId}, ${companyId}, ${`Prova 248 antes ${typeId}`}, 'delivery', 'off', 'unset')
  `
  await runDatabaseMigrations({ connectionString })

  const [stored] = (await database`
    select contractor_reply_mode, contractor_reply_attachment_kind, driver_reply_channel,
      driver_reply_window_closed_action, driver_reply_template, contractor_reply_wait_hours,
      contractor_reply_alert_mode, contractor_reply_alert_interval_minutes,
      contractor_reply_alert_max_count, forward_to_note_recipient, forward_to_informed_email
    from company_occurrence_types where id = ${typeId}
  `) as Record<string, unknown>[]
  expect(stored).toEqual({
    contractor_reply_alert_interval_minutes: 60,
    contractor_reply_alert_max_count: 24,
    contractor_reply_alert_mode: 'off',
    contractor_reply_attachment_kind: 'pdf',
    contractor_reply_mode: 'off',
    contractor_reply_wait_hours: null,
    driver_reply_channel: 'app_chat',
    driver_reply_template: '',
    driver_reply_window_closed_action: 'fallback_app_chat',
    forward_to_informed_email: 'off',
    forward_to_note_recipient: 'off',
  })
}

export async function assertOccurrenceContractorReplyConstraints(
  probe: OccurrenceContractorReplyConstraintsProbe,
): Promise<void> {
  const { companyId, database, tripId, userId } = probe
  await assertDefaultsOnExistingType(probe)
  const input = { companyId, database, tripId, userId }
  const fixture = await createContractorReplyFixture(input)
  try {
    await assertOccurrenceContractorReplyTypeConstraints({ companyId, database })
    await assertOccurrenceContractorReplyRows({ companyId, database, fixture, userId })
  } finally {
    await removeContractorReplyFixture(input)
  }
}
