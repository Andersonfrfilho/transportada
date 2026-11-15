/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF24 (decisão do Anderson, 2026-11-15): motorista nunca recebe aviso de conta. O leitor de pessoas da rotina
 * (`drizzle-company-expense-reminder.repository.ts`) é SQL por valor, espelho do leitor da API; só o banco prova que o papel
 * de quem dirige (direto ou por grupo) e a ficha da frota que dirige tiram a pessoa, como responsável e como administrador,
 * e que o ajudante também não recebe (decisão de 2026-11-15). Banco descartável com só as colunas que a consulta lê.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createDrizzleCompanyExpenseReminderPorts } from '../../src/company-expense-reminder/infrastructure/drizzle-company-expense-reminder.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeIntegration = databaseUrl === undefined ? describe.skip : describe

describeIntegration(
  'quem a rotina dos lembretes de conta lê, contra Postgres (spec 325 RF24)',
  () => {
    let admin: SQL
    let database: ReturnType<typeof createDrizzleProvider>
    let databaseName: string
    const companyId = crypto.randomUUID()
    const people = {
      admin: crypto.randomUUID(),
      drivingAdmin: crypto.randomUUID(),
      driver: crypto.randomUUID(),
      fleetDriver: crypto.randomUUID(),
      groupAggregate: crypto.randomUUID(),
      fleetHelper: crypto.randomUUID(),
      helper: crypto.randomUUID(),
    }

    async function addPerson(input: {
      readonly drives?: boolean
      readonly helps?: boolean
      readonly groupRole?: string
      readonly roles: readonly string[]
      readonly userId: string
    }): Promise<void> {
      const membershipId = crypto.randomUUID()
      const { userId } = input
      await database.db.execute(`
      insert into identity_users (id, status) values ('${userId}', 'active');
      insert into identity_user_profiles (user_id, name, email, contact_channel, contact_address)
        values ('${userId}', 'Pessoa', '${userId}@exemplo.com.br', 'email', '${userId}@exemplo.com.br');
      insert into user_company_memberships (id, company_id, user_id, status)
        values ('${membershipId}', '${companyId}', '${userId}', 'active');
    `)
      for (const role of input.roles) {
        await database.db.execute(
          `insert into membership_roles (membership_id, role) values ('${membershipId}', '${role}')`,
        )
      }
      if (input.groupRole !== undefined) {
        const groupId = crypto.randomUUID()
        await database.db.execute(`
        insert into company_group_roles (group_id, role) values ('${groupId}', '${input.groupRole}');
        insert into membership_groups (membership_id, group_id) values ('${membershipId}', '${groupId}');
      `)
      }
      if (input.drives !== undefined) {
        await database.db.execute(`
        insert into fleet_drivers (id, company_id, membership_id, can_drive, can_act_as_helper)
          values ('${crypto.randomUUID()}', '${companyId}', '${membershipId}', ${input.drives}, ${input.helps ?? false});
      `)
      }
    }

    beforeAll(async () => {
      admin = new SQL(databaseUrl as string, { max: 1 })
      databaseName = `transportada_expreminder_${crypto.randomUUID().replaceAll('-', '')}`
      await admin.unsafe(`create database "${databaseName}"`)
      const disposableUrl = new URL(databaseUrl as string)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      database = createDrizzleProvider({ connection: disposableUrl.toString() })
      await database.db.execute(`
      create table identity_users (id uuid primary key, status text not null);
      create table identity_user_profiles (user_id uuid primary key, name text, email text, contact_channel text, contact_address text);
      create table user_company_memberships (id uuid primary key, company_id uuid not null, user_id uuid not null, status text not null);
      create table membership_roles (membership_id uuid not null, role text not null);
      create table membership_groups (membership_id uuid not null, group_id uuid not null);
      create table company_group_roles (group_id uuid not null, role text not null);
      create table fleet_drivers (id uuid primary key, company_id uuid not null, membership_id uuid, can_drive boolean not null default true, can_act_as_helper boolean not null default false);
      create table company_expense_reminder_preferences (company_id uuid not null, user_id uuid not null, whatsapp_enabled boolean not null default false, push_enabled boolean not null default false);
      create table user_whatsapp_phones (user_id uuid not null, verified_at timestamptz);
    `)
      await addPerson({ roles: ['company-admin'], userId: people.admin })
      await addPerson({ roles: ['company-admin', 'driver'], userId: people.drivingAdmin })
      await addPerson({ roles: ['driver'], userId: people.driver })
      await addPerson({ groupRole: 'aggregate', roles: ['finance'], userId: people.groupAggregate })
      await addPerson({ drives: true, roles: ['operator'], userId: people.fleetDriver })
      await addPerson({ drives: false, roles: ['helper'], userId: people.helper })
      await addPerson({
        drives: false,
        helps: true,
        roles: ['operator'],
        userId: people.fleetHelper,
      })
    }, 60_000)

    afterAll(async () => {
      try {
        await database?.close()
      } finally {
        try {
          await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
        } finally {
          await admin?.close({ timeout: 0 })
        }
      }
    }, 60_000)

    function ports() {
      return createDrizzleCompanyExpenseReminderPorts({
        appBaseUrl: null,
        database: database.db,
        emailDriver: undefined,
      })
    }

    test('administradores: o que também dirige fica de fora', async () => {
      const admins = await ports().people.findAdmins({ companyId })
      expect(admins.map((person) => person.userId)).toEqual([people.admin])
    })

    test('responsável motorista (papel, grupo ou ficha que dirige) é "não existe"', async () => {
      for (const userId of [
        people.driver,
        people.groupAggregate,
        people.fleetDriver,
        people.drivingAdmin,
      ]) {
        expect({ person: await ports().people.findById({ companyId, userId }), userId }).toEqual({
          person: null,
          userId,
        })
      }
    })

    test('o ajudante nunca recebe: nem pelo papel, nem pela ficha que ajuda (decisão de 2026-11-15)', async () => {
      for (const userId of [people.helper, people.fleetHelper]) {
        expect({ person: await ports().people.findById({ companyId, userId }), userId }).toEqual({
          person: null,
          userId,
        })
      }
    })
  },
)
