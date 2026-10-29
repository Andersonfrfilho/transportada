/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T2 (RF2, RF5): a migration cria a matriz "Retorno ao cliente" do tipo e a preenche pela regra de
 * `deriveClientChannelMatrixFromLegacy`; o texto livre antigo (`forward_email_subject`/`forward_email_body`) vira um
 * modelo `email` do módulo de notificação (e um `whatsapp` sem HTML quando o tipo fala por WhatsApp), e o canal aponta
 * para ele. Aditiva: os campos antigos ficam. O rollback tira só a tabela; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  readNotificationRollbackSql,
  runNotificationSchemaMigrations,
} from '../../src/database/notification-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_client_channels'
const TABLE = 'company_occurrence_type_client_channels'

export type OccurrenceTypeClientChannelsProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

type ChannelRow = {
  readonly channel: string
  readonly enabled: boolean
  readonly send_mode: string
  readonly template_key: null | string
}

type LegacyType = {
  readonly body: string
  readonly channel: string
  readonly emailType: string
  readonly sendMode: string
  readonly subject: string
}

async function hasTable(database: SQL): Promise<boolean> {
  const rows = (await database`select to_regclass(${`public.${TABLE}`}) as name`) as readonly {
    readonly name: null | string
  }[]
  return rows[0]?.name !== null
}

async function insertType(
  database: SQL,
  params: { readonly companyId: string; readonly type: LegacyType },
): Promise<string> {
  const id = crypto.randomUUID()
  const { body, channel, emailType, sendMode, subject } = params.type
  await database`
    insert into company_occurrence_types
      (id, company_id, name, stage, client_channel, client_email_type, client_email_send_mode,
       forward_email_subject, forward_email_body)
    values (${id}, ${params.companyId}, ${`Prova 286 T2 ${id}`}, 'delivery', ${channel}, ${emailType},
            ${sendMode}, ${subject}, ${body})
  `
  return id
}

async function readChannels(database: SQL, typeId: string): Promise<Record<string, ChannelRow>> {
  const rows = (await database`
    select channel, enabled, send_mode, template_key from company_occurrence_type_client_channels
     where occurrence_type_id = ${typeId}
  `) as readonly ChannelRow[]
  return Object.fromEntries(rows.map((row) => [row.channel, row]))
}

async function readTemplate(
  database: SQL,
  params: { readonly channel: string; readonly companyId: string; readonly key: string },
): Promise<{ readonly body: string; readonly subject: null | string } | undefined> {
  const [row] = (await database`
    select subject, body from notification.templates
     where company_id = ${params.companyId} and key = ${params.key} and channel = ${params.channel}
       and locale = 'pt-BR' and active
  `) as readonly { readonly body: string; readonly subject: null | string }[]
  return row
}

export async function assertOccurrenceTypeClientChannels(
  probe: OccurrenceTypeClientChannelsProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_client_channels is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  /** A primeira passada desta base já provou o caminho sem o schema do módulo (base nova): nenhum erro, nenhum modelo. */
  expect(await hasTable(database)).toBe(true)

  /** O caminho do staging: o schema do módulo existe quando a migration roda de novo. */
  await runNotificationSchemaMigrations({ connectionString })
  await database.unsafe(rollback)
  expect(await hasTable(database)).toBe(false)
  expect(await readMigrationNames(database)).not.toContain(directory)

  const both = await insertType(database, {
    companyId,
    type: {
      body: 'Olá,\n\nsegue o <b>boleto</b>.',
      channel: 'both',
      emailType: 'boleto',
      sendMode: 'automatic',
      subject: 'Boleto   da nota',
    },
  })
  const emailWithoutType = await insertType(database, {
    companyId,
    type: { body: '', channel: 'email', emailType: 'off', sendMode: 'manual', subject: '' },
  })
  const whatsappOnly = await insertType(database, {
    companyId,
    type: { body: '', channel: 'whatsapp', emailType: 'off', sendMode: 'manual', subject: '' },
  })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)

  const key = `occurrence.client-reply.${both}`
  expect(await readChannels(database, both)).toEqual({
    email: { channel: 'email', enabled: true, send_mode: 'automatic', template_key: key },
    whatsapp: { channel: 'whatsapp', enabled: true, send_mode: 'manual', template_key: key },
  })
  expect(await readTemplate(database, { channel: 'email', companyId, key })).toEqual({
    body: 'Olá,\n\nsegue o <b>boleto</b>.',
    subject: 'Boleto da nota',
  })
  expect(await readTemplate(database, { channel: 'whatsapp', companyId, key })).toEqual({
    body: 'Olá,\n\nsegue o boleto.',
    subject: null,
  })

  /** `client_email_type = off` não mandava e-mail: a caixa nasce desmarcada; sem texto, sem modelo. */
  expect(await readChannels(database, emailWithoutType)).toEqual({
    email: { channel: 'email', enabled: false, send_mode: 'manual', template_key: null },
    whatsapp: { channel: 'whatsapp', enabled: false, send_mode: 'manual', template_key: null },
  })
  expect(await readChannels(database, whatsappOnly)).toEqual({
    email: { channel: 'email', enabled: false, send_mode: 'manual', template_key: null },
    whatsapp: { channel: 'whatsapp', enabled: true, send_mode: 'manual', template_key: null },
  })

  /** Os campos antigos ficaram como estavam (aditiva). */
  const [legacy] = (await database`
    select client_channel, forward_email_subject from company_occurrence_types where id = ${both}
  `) as readonly { readonly client_channel: string; readonly forward_email_subject: string }[]
  expect(legacy).toEqual({ client_channel: 'both', forward_email_subject: 'Boleto   da nota' })

  /** Um canal por tipo, e o tipo apagado leva as linhas junto. */
  const duplicate = await database`
    insert into company_occurrence_type_client_channels (company_id, occurrence_type_id, channel)
    values (${companyId}, ${both}, 'email')
  `.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(duplicate).toBeDefined()
  for (const id of [both, emailWithoutType, whatsappOnly]) {
    await database`delete from company_occurrence_types where id = ${id}`
    expect(await readChannels(database, id)).toEqual({})
  }
  await database.unsafe(await readNotificationRollbackSql())
}
