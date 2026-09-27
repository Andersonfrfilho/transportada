/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A aprovação do agregado grava direto em `fleet_drivers`/`fleet_vehicles`, e são as CHECK
 * constraints dessas tabelas que decidem se o dado incompleto da candidatura pode virar ficha.
 * Nada disso aparece em teste com repositório falso — lá o `INSERT` é uma promessa que sempre
 * resolve. Dois incidentes de produção (2026-09-26) já vieram desse ponto cego: candidatura com
 * chave PIX sem o tipo (`fleet_drivers_pix_key_check`) e com veículo sem o tipo declarado
 * (`fleet_vehicles_vehicle_type_check`) — os dois só estouravam na aprovação, nunca na submissão.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  aggregateApplications,
  companies,
  fleetDrivers,
} from '../../src/database/database.schema.js'
import { createDrizzleAggregateApplicationRepository } from '../../src/fleet/infrastructure/drizzle-aggregate-application.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_aggapproval_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedApplication(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly declaredData: unknown; readonly taxId: string },
): Promise<string> {
  const [row] = await db
    .insert(aggregateApplications)
    .values({
      companyId: input.companyId,
      declaredData: input.declaredData,
      email: 'candidato@example.test',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: input.taxId,
    })
    .returning({ id: aggregateApplications.id })
  if (row === undefined) throw new Error('application not seeded')
  return row.id
}

describe('aprovação de agregado grava ficha completa, contra Postgres', () => {
  /**
   * Reproduz os dois incidentes juntos: PIX declarado sem o tipo (spec do PR #104) e veículo
   * declarado (tem placa) sem o tipo do veículo. Antes das duas correções, cada um sozinho já
   * estourava `INSERT INTO fleet_drivers`/`fleet_vehicles` com 500 — aqui os dois entram na mesma
   * candidatura de propósito, para a regressão cobrir a combinação, não só cada campo isolado.
   */
  testWithPostgres(
    'motorista com PIX incompleto e veículo sem tipo aprova sem violar constraint nenhuma',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const applicationId = await seedApplication(db, {
          companyId,
          declaredData: {
            driver: { pixKey: '11988887777' },
            vehicle: { plate: 'ABC1D23' },
          },
          taxId: '12345678909',
        })

        const approved = await createDrizzleAggregateApplicationRepository(
          db,
        ).createDriverAndApprove({
          companyId,
          declaredData: { driver: { pixKey: '11988887777' }, vehicle: { plate: 'ABC1D23' } },
          email: 'candidato@example.test',
          id: applicationId,
          name: 'Fulano de Tal',
          phone: '11988887777',
          taxId: '12345678909',
        })

        expect(approved.status).toBe('approved')
        expect(approved.driverId).not.toBeNull()

        const driverId = approved.driverId
        if (driverId === null) throw new Error('driverId ausente após aprovação')
        const [driver] = await db
          .select({ pixKey: fleetDrivers.pixKey, pixKeyType: fleetDrivers.pixKeyType })
          .from(fleetDrivers)
          .where(eq(fleetDrivers.id, driverId))
        expect(driver?.pixKey).toBe('')
        expect(driver?.pixKeyType).toBe('')
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
