/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1.3 (RF3, RF4, CA04), contra Postgres real: o **valor da coluna** depois da migration,
 * sobre tipos e exceções gravados **antes** das colunas novas. O `migration-test` roda sobre banco
 * vazio — é aqui que os `UPDATE`s encontram linhas. O banco descartável nasce migrado, desfaz só a
 * 246 pelo próprio `rollback.sql`, recebe o dado antigo, e o migrador reaplica o `migration.sql`
 * lido do disco: o que este teste prova é o que vai para produção.
 */
import { join } from 'node:path'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261006205139_occurrence_type_requirement_modes/',
  import.meta.url,
)
const CONTRACTOR_TAX_ID = '30290856000160'
const OTHER_CONTRACTOR_TAX_ID = '11222333000181'
const RECIPIENT_TAX_ID = '12345678000190'
const OTHER_RECIPIENT_TAX_ID = '98765432000110'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type Modes = Readonly<{ note_mode: string | null; signature_mode: string | null }>

type Seed = Readonly<{
  typeIds: Readonly<Record<'required' | 'optional' | 'off', string>>
  contractorOverrideIds: Readonly<Record<'required' | 'optional', string>>
  recipientOverrideIds: Readonly<Record<'required' | 'off', string>>
}>

async function seedTypes(database: SQL, companyId: string): Promise<Seed['typeIds']> {
  const typeIds = {
    off: crypto.randomUUID(),
    optional: crypto.randomUUID(),
    required: crypto.randomUUID(),
  }
  for (const [attachmentMode, id] of Object.entries(typeIds)) {
    await database`
      insert into company_occurrence_types (id, company_id, name, stage, attachment_mode)
      values (${id}, ${companyId}, ${`Tipo ${attachmentMode}`}, 'delivery', ${attachmentMode})
    `
  }
  return typeIds
}

/** Exceções sobre o tipo `required`: a que repete, a que afrouxa e a que desliga a foto. */
async function seedOverrides(
  database: SQL,
  companyId: string,
  typeId: string,
): Promise<Omit<Seed, 'typeIds'>> {
  const contractorIds = [crypto.randomUUID(), crypto.randomUUID()] as const
  for (const [index, taxId] of [CONTRACTOR_TAX_ID, OTHER_CONTRACTOR_TAX_ID].entries()) {
    await database`
      insert into contractors (id, company_id, tax_id)
      values (${contractorIds[index]}, ${companyId}, ${taxId})
    `
  }
  for (const taxId of [RECIPIENT_TAX_ID, OTHER_RECIPIENT_TAX_ID]) {
    await database`insert into delivery_clients (company_id, tax_id) values (${companyId}, ${taxId})`
  }
  const contractorOverrideIds = { optional: crypto.randomUUID(), required: crypto.randomUUID() }
  const recipientOverrideIds = { off: crypto.randomUUID(), required: crypto.randomUUID() }
  await database`
    insert into company_occurrence_type_contractor_overrides
      (id, company_id, occurrence_type_id, contractor_id, attachment_mode)
    values
      (${contractorOverrideIds.required}, ${companyId}, ${typeId}, ${contractorIds[0]}, 'required'),
      (${contractorOverrideIds.optional}, ${companyId}, ${typeId}, ${contractorIds[1]}, 'optional')
  `
  await database`
    insert into company_occurrence_type_recipient_overrides
      (id, company_id, occurrence_type_id, tax_id, attachment_mode)
    values
      (${recipientOverrideIds.required}, ${companyId}, ${typeId}, ${RECIPIENT_TAX_ID}, 'required'),
      (${recipientOverrideIds.off}, ${companyId}, ${typeId}, ${OTHER_RECIPIENT_TAX_ID}, 'off')
  `
  return { contractorOverrideIds, recipientOverrideIds }
}

async function readModes(database: SQL, table: string, id: string): Promise<Modes> {
  const [row] = (await database.unsafe(
    `select note_mode, signature_mode from ${table} where id = $1`,
    [id],
  )) as Modes[]
  if (row === undefined) throw new Error(`Seeded row ${id} vanished from ${table}`)
  return row
}

async function seedBeforeColumns(database: SQL, connectionString: string): Promise<Seed> {
  const rollback = await Bun.file(join(MIGRATION_DIRECTORY.pathname, 'rollback.sql')).text()
  await database.unsafe(rollback)

  const companyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${companyId}, 'active')`
  const typeIds = await seedTypes(database, companyId)
  const overrides = await seedOverrides(database, companyId, typeIds.required)

  await runDatabaseMigrations({ connectionString })
  return { ...overrides, typeIds }
}

describe('a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3)', () => {
  testWithPostgres(
    'tipo e exceções antigos saem com observação e assinatura conforme a regra da 179',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        namePrefix: 'transportada_reqmodes',
        migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
        open: (connectionString) => new SQL(connectionString, { max: 1 }),
        operation: async (database, connectionString) => {
          const seed = await seedBeforeColumns(database, connectionString)
          const types = 'company_occurrence_types'
          const contractors = 'company_occurrence_type_contractor_overrides'
          const recipients = 'company_occurrence_type_recipient_overrides'

          // Tipo: foto `required` arrasta a observação; o resto fica opcional; assinatura `off`.
          expect(await readModes(database, types, seed.typeIds.required)).toEqual({
            note_mode: 'required',
            signature_mode: 'off',
          })
          for (const id of [seed.typeIds.optional, seed.typeIds.off]) {
            expect(await readModes(database, types, id)).toEqual({
              note_mode: 'optional',
              signature_mode: 'off',
            })
          }

          // Exceção: a observação segue a foto da própria exceção; assinatura nula, herda o tipo.
          const overrideCases = [
            [contractors, seed.contractorOverrideIds.required, 'required'],
            [contractors, seed.contractorOverrideIds.optional, 'optional'],
            [recipients, seed.recipientOverrideIds.required, 'required'],
            [recipients, seed.recipientOverrideIds.off, 'optional'],
          ] as const
          expect(overrideCases).toHaveLength(4)
          for (const [table, id, noteMode] of overrideCases) {
            expect(await readModes(database, table, id)).toEqual({
              note_mode: noteMode,
              signature_mode: null,
            })
          }
        },
      })
    },
    60_000,
  )
})
