/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type {
  FiscalSequenceReservationPort,
  ReserveFiscalNumberInput,
} from '../../src/companies/application/fiscal-sequence-reservation.port.js'
import { DrizzleFiscalSequenceReservationRepository } from '../../src/companies/infrastructure/drizzle-fiscal-sequence-reservation.repository.js'
import { companies, fiscalSequences } from '../../src/database/database.schema.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

export const INITIAL_NUMBER = 9_001n
export const PRIMARY_SERIES = 1n
export const SECONDARY_SERIES = 2n
export const testWithPostgres = databaseUrl === undefined ? test.skip : test
export type TestDatabase = ReturnType<typeof createDrizzleProvider>

export type ExpectedFiscalNumberReservation = {
  readonly isReplay: boolean
  readonly number: bigint
  readonly sequenceId: string
}

export type FiscalSequenceFixture = {
  readonly companyId: string
  readonly database: TestDatabase
  readonly otherCompanyId: string
  readonly reservationPort: FiscalSequenceReservationPort
}

export async function withFiscalSequenceFixture(
  operation: (fixture: FiscalSequenceFixture) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (connectionString) => {
    const database = createDrizzleProvider({ connection: connectionString })
    try {
      await operation(await createFixture(database))
    } finally {
      await database.close()
    }
  })
}

export function createReservationInput(
  input: Partial<ReserveFiscalNumberInput> & Pick<ReserveFiscalNumberInput, 'companyId'>,
): ReserveFiscalNumberInput {
  return {
    companyId: input.companyId,
    environment: input.environment ?? 'homologation',
    model: input.model ?? 'cte',
    reservationKey: input.reservationKey ?? crypto.randomUUID(),
    series: input.series ?? PRIMARY_SERIES,
  }
}

async function createFixture(database: TestDatabase): Promise<FiscalSequenceFixture> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])
  await seedSequences({ companyId, database, otherCompanyId })
  return {
    companyId,
    database,
    otherCompanyId,
    reservationPort: new DrizzleFiscalSequenceReservationRepository(database.db),
  }
}

type SeedSequencesParams = {
  readonly companyId: string
  readonly database: TestDatabase
  readonly otherCompanyId: string
}

async function seedSequences(input: SeedSequencesParams): Promise<void> {
  await input.database.db.insert(fiscalSequences).values([
    createSequence({
      companyId: input.companyId,
      environment: 'homologation',
      series: PRIMARY_SERIES,
    }),
    createSequence({
      companyId: input.companyId,
      environment: 'production',
      series: PRIMARY_SERIES,
    }),
    createSequence({
      companyId: input.companyId,
      environment: 'homologation',
      series: SECONDARY_SERIES,
    }),
    createSequence({
      companyId: input.otherCompanyId,
      environment: 'homologation',
      series: PRIMARY_SERIES,
    }),
  ])
}

type CreateSequenceParams = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly series: bigint
}

function createSequence(input: CreateSequenceParams): typeof fiscalSequences.$inferInsert {
  return {
    companyId: input.companyId,
    environment: input.environment,
    model: 'cte',
    nextNumber: INITIAL_NUMBER,
    series: input.series,
  }
}

async function withDisposableDatabase(
  operation: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t020_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    await operation(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}
