/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF24, RF26): quem recebe o aviso e por quais canais, lido do banco. O que só o banco prova: o vínculo
 * ativo da empresa decide quem existe (outra empresa, vínculo ou conta desligados = não existe), o e-mail vem do perfil
 * ou do contato do convite, o WhatsApp exige opt-in **e** número verificado, a preferência é por empresa, e sem linha de
 * configuração vale o padrão.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { DEFAULT_REMINDER_SETTINGS } from '../../src/expenses/application/expense-reminder.port.js'
import {
  createDrizzleExpenseReminderRecipients,
  createDrizzleExpenseReminderSettings,
} from '../../src/expenses/infrastructure/drizzle-expense-reminder-recipients.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describeDatabase('destinatários dos lembretes de vencimento no banco (spec 325 T7.3)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  /** Administradora com e-mail no perfil, WhatsApp verificado e opt-in só na empresa A. */
  const admin = crypto.randomUUID()
  /** Responsável sem e-mail no perfil, mas convidada por e-mail; opt-in de WhatsApp sem número verificado. */
  const responsible = crypto.randomUUID()
  /** Administrador com conta desligada: nunca recebe. */
  const disabledAdmin = crypto.randomUUID()
  /** Administrador com vínculo desligado na empresa A. */
  const formerAdmin = crypto.randomUUID()
  /** Operador convidado por WhatsApp, sem e-mail, com push ligado. */
  const operator = crypto.randomUUID()
  const databaseName = `transportada_325_t73_${crypto.randomUUID().replaceAll('-', '')}`
  let adminSql: SQL | undefined
  let database: TestDatabase | undefined

  function db() {
    if (database === undefined) throw new Error('A disposable database is required')
    return database.db
  }

  async function addMember(input: {
    companyId: string
    membershipStatus?: 'active' | 'disabled'
    roles: string[]
    userId: string
  }): Promise<void> {
    const membershipId = crypto.randomUUID()
    await db().execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${input.userId}, ${input.companyId}, ${input.membershipStatus ?? 'active'})
    `)
    for (const role of input.roles) {
      await db().execute(
        sql`insert into membership_roles (membership_id, role) values (${membershipId}, ${role})`,
      )
    }
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    adminSql = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    await adminSql.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    for (const companyId of [companyA, companyB]) {
      await db().execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    }
    const people: [string, 'active' | 'disabled', string, string, string, string][] = [
      [admin, 'active', 'Ana Admin', 'email', 'ana@exemplo.com.br', 'ana@exemplo.com.br'],
      [responsible, 'active', 'Rita Resp', 'email', 'rita@exemplo.com.br', ''],
      [
        disabledAdmin,
        'disabled',
        'Davi Off',
        'email',
        'davi@exemplo.com.br',
        'davi@exemplo.com.br',
      ],
      [formerAdmin, 'active', 'Fábio Ex', 'email', 'fabio@exemplo.com.br', 'fabio@exemplo.com.br'],
      [operator, 'active', 'Otto Op', 'whatsapp', '5516999990001', ''],
    ]
    for (const [userId, status, name, channel, address, email] of people) {
      await db().execute(sql`insert into identity_users (id, status) values (${userId}, ${status})`)
      await db().execute(sql`
        insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address, email)
        values (${userId}, ${name}, ${userId}, ${channel}, ${address}, ${email})
      `)
    }
    await addMember({ companyId: companyA, roles: ['company-admin'], userId: admin })
    await addMember({ companyId: companyB, roles: ['company-admin'], userId: admin })
    await addMember({ companyId: companyA, roles: ['finance'], userId: responsible })
    await addMember({ companyId: companyA, roles: ['company-admin'], userId: disabledAdmin })
    await addMember({
      companyId: companyA,
      membershipStatus: 'disabled',
      roles: ['company-admin'],
      userId: formerAdmin,
    })
    await addMember({ companyId: companyA, roles: ['operator'], userId: operator })

    await db().execute(sql`
      insert into user_whatsapp_phones (user_id, phone, verified_at) values
        (${admin}, '5516999990002', now()),
        (${responsible}, '5516999990003', null)
    `)
    await db().execute(sql`
      insert into company_expense_reminder_preferences (company_id, user_id, whatsapp_enabled, push_enabled) values
        (${companyA}, ${admin}, true, false),
        (${companyA}, ${responsible}, true, false),
        (${companyA}, ${operator}, false, true)
    `)
  }, 60_000)

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await adminSql?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await adminSql?.close({ timeout: 0 })
      }
    }
  }, 60_000)

  test('administradores: só vínculo e conta ativos com o papel, cada um com os canais dele', async () => {
    const recipients = createDrizzleExpenseReminderRecipients(db())
    expect(await recipients.findAdmins({ companyId: companyA })).toEqual([
      { channels: ['email', 'whatsapp'], userId: admin },
    ])
  })

  test('a preferência é por empresa: na B a mesma pessoa só tem e-mail', async () => {
    const recipients = createDrizzleExpenseReminderRecipients(db())
    expect(await recipients.findAdmins({ companyId: companyB })).toEqual([
      { channels: ['email'], userId: admin },
    ])
  })

  test('e-mail do convite vale; opt-in de WhatsApp sem número verificado não liga o WhatsApp', async () => {
    const recipients = createDrizzleExpenseReminderRecipients(db())
    expect(await recipients.findById({ companyId: companyA, userId: responsible })).toEqual({
      channels: ['email'],
      userId: responsible,
    })
  })

  test('sem e-mail, só o canal que a pessoa ligou', async () => {
    const recipients = createDrizzleExpenseReminderRecipients(db())
    expect(await recipients.findById({ companyId: companyA, userId: operator })).toEqual({
      channels: ['push'],
      userId: operator,
    })
  })

  test('outra empresa, vínculo desligado ou conta desligada: não existe', async () => {
    const recipients = createDrizzleExpenseReminderRecipients(db())
    expect(await recipients.findById({ companyId: companyB, userId: responsible })).toBeNull()
    expect(await recipients.findById({ companyId: companyA, userId: formerAdmin })).toBeNull()
    expect(await recipients.findById({ companyId: companyA, userId: disabledAdmin })).toBeNull()
    expect(
      await recipients.findById({ companyId: companyA, userId: crypto.randomUUID() }),
    ).toBeNull()
  })

  test('configuração: sem linha é o padrão; com linha, os canais ligados e a hora', async () => {
    const settings = createDrizzleExpenseReminderSettings(db())
    expect(await settings.get({ companyId: companyA })).toEqual(DEFAULT_REMINDER_SETTINGS)
    await db().execute(sql`
      insert into company_expense_reminder_settings
        (company_id, days_before, max_overdue_notices, email_enabled, whatsapp_enabled, push_enabled,
         daily_summary_enabled, daily_summary_hour)
      values (${companyB}, 5, 2, true, true, false, true, 7)
    `)
    expect(await settings.get({ companyId: companyB })).toEqual({
      dailySummaryEnabled: true,
      dailySummaryHour: 7,
      daysBefore: 5,
      enabledChannels: ['email', 'whatsapp'],
      maxOverdueNotices: 2,
    })
  })

  test('a preferência é única por pessoa e empresa', async () => {
    let failure: unknown
    try {
      await db().execute(sql`
        insert into company_expense_reminder_preferences (company_id, user_id) values (${companyA}, ${admin})
      `)
    } catch (error) {
      failure = error
    }
    expect(String((failure as { cause?: unknown })?.cause ?? failure)).toContain(
      'company_expense_reminder_preferences_company_user_unique',
    )
  })
})
