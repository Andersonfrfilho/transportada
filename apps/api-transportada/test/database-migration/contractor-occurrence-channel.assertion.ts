/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 T1: o canal do aviso de ocorrência por contratante. A tabela nova guarda canal
 * (`email` padrão | `whatsapp_group`), grupo `@g.us`, telefone a marcar e a reserva por e-mail. As CHECKs
 * recusam canal fora da lista, grupo sem forma de `@g.us`, telefone inválido e canal de grupo sem
 * grupo ou sem número; os únicos recusam a contratante duas vezes e o mesmo grupo em duas contratantes.
 * O rollback recusa com canal de grupo gravado e, sem ele, derruba a tabela; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from './business-calendar-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_contractor_occurrence_channels'
const GROUP_JID = '120363000000000001@g.us'
const OTHER_GROUP_JID = '120363000000000002@g.us'
const PHONE = '5516999990000'

export type ContractorOccurrenceChannelProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

async function tableExists(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contractor_occurrence_channels'
  `) as unknown[]
  return rows.length === 1
}

async function insertContractor(database: SQL, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  const taxId = String(Math.floor(Math.random() * 1e14)).padStart(14, '0')
  await database`insert into contractors (id, company_id, tax_id) values (${id}, ${companyId}, ${taxId})`
  return id
}

export async function assertContractorOccurrenceChannel(
  probe: ContractorOccurrenceChannelProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('contractor_occurrence_channels is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const first = await insertContractor(database, companyId)
  const second = await insertContractor(database, companyId)

  // Linha mínima: o padrão é e-mail, com reserva ligada e sem grupo.
  await database`insert into contractor_occurrence_channels (company_id, contractor_id) values (${companyId}, ${first})`
  const [stored] = (await database`
    select channel, group_jid, mention_phone, email_fallback from contractor_occurrence_channels
    where contractor_id = ${first}
  `) as {
    channel: string
    email_fallback: boolean
    group_jid: null | string
    mention_phone: null | string
  }[]
  expect(stored).toEqual({
    channel: 'email',
    email_fallback: true,
    group_jid: null,
    mention_phone: null,
  })

  await expectQueryToFail(
    database`insert into contractor_occurrence_channels (company_id, contractor_id) values (${companyId}, ${first})`,
    UNIQUE_VIOLATION,
  )
  await expectQueryToFail(
    database`insert into contractor_occurrence_channels (company_id, contractor_id, channel) values (${companyId}, ${second}, 'sms')`,
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    database`
      insert into contractor_occurrence_channels (company_id, contractor_id, channel, group_jid, mention_phone)
      values (${companyId}, ${second}, 'whatsapp_group', '5516999990000', ${PHONE})
    `,
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    database`
      insert into contractor_occurrence_channels (company_id, contractor_id, channel, group_jid, mention_phone)
      values (${companyId}, ${second}, 'whatsapp_group', ${GROUP_JID}, '123')
    `,
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    database`insert into contractor_occurrence_channels (company_id, contractor_id, channel, mention_phone) values (${companyId}, ${second}, 'whatsapp_group', ${PHONE})`,
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    database`insert into contractor_occurrence_channels (company_id, contractor_id, channel, group_jid) values (${companyId}, ${second}, 'whatsapp_group', ${GROUP_JID})`,
    CHECK_VIOLATION,
  )

  await database`
    update contractor_occurrence_channels
    set channel = 'whatsapp_group', group_jid = ${GROUP_JID}, mention_phone = ${PHONE}
    where contractor_id = ${first}
  `
  // O mesmo grupo não serve a duas contratantes da empresa.
  await expectQueryToFail(
    database`
      insert into contractor_occurrence_channels (company_id, contractor_id, channel, group_jid, mention_phone)
      values (${companyId}, ${second}, 'whatsapp_group', ${GROUP_JID}, ${PHONE})
    `,
    UNIQUE_VIOLATION,
  )
  await database`
    insert into contractor_occurrence_channels (company_id, contractor_id, channel, group_jid, mention_phone)
    values (${companyId}, ${second}, 'whatsapp_group', ${OTHER_GROUP_JID}, ${PHONE})
  `

  // Com canal de grupo gravado o rollback recusa e a tabela fica.
  expect(await runRollback(database, rollback)).toBeInstanceOf(Error)
  expect(await tableExists(database)).toBe(true)

  await database`delete from contractor_occurrence_channels where contractor_id in (${first}, ${second})`
  await database.unsafe(rollback)
  expect(await tableExists(database)).toBe(false)

  await runDatabaseMigrations({ connectionString })
  expect(await tableExists(database)).toBe(true)

  await database`delete from contractors where id in (${first}, ${second})`
}

async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}
