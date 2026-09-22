/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUserProfiles,
  identityUsers,
  nfePackageBoxes,
  nfePackageBoxMeasurements,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { createListPackageBoxMeasurements } from '../../src/nfe-documents/application/list-package-box-measurements.use-case'
import { DrizzlePackageBoxMeasurementExportRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box-measurement-export.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Spec 152 (T5, R8, experimental): export do histórico para a validação da Fase 7 — período,
 * cursor, só a empresa do token, sem descrição do produto nem CNPJ do emitente, e o ator resolvido
 * pela membership (nunca id cru sem nome).
 */
describe('export do histórico de medida (spec 152, T5, R8)', () => {
  testWithPostgres(
    'devolve as linhas da empresa, mais recente primeiro, com o ator resolvido pela membership',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const listPackageBoxMeasurements = buildUseCase(database)

        const page = await listPackageBoxMeasurements.execute({
          companyId: scenario.companyId,
          cursor: null,
          from: undefined,
          limit: 20,
          to: undefined,
        })

        /**
         * T14 (revisão final, ALTO-1): a caixa nunca foi medida — a dimensão veio de uma irmã da
         * família (D6) — e por isso não é leitura de câmera nenhuma para validar. Mesmo mais
         * recente que as outras duas, `replicated` não pode aparecer aqui.
         */
        expect(page.items.map((item) => item.id)).toEqual([
          scenario.secondMeasurementId,
          scenario.firstMeasurementId,
        ])
        expect(page.items.map((item) => item.id)).not.toContain(scenario.replicatedMeasurementId)
        expect(page.nextCursor).toBeNull()

        const latest = page.items[0]!
        expect(latest.productCode).toBe('7896004003405')
        expect(latest.cartonGtin).toBeNull()
        expect(latest.source).toBe('camera')
        expect(latest.proposedLengthMm).toBe(301)
        expect(latest.lengthMarginMm).toBe(7)
        expect(latest.warnings).toEqual(['steepAngle'])
        expect(latest.impreciseConfirmed).toBe(false)
        expect(latest.engine).toBe('aruco-homography-v1')
        // Ator sem membership ativa na empresa: nunca o id cru (D16, H13, mesmo cuidado da T3/nfe-document-event).
        expect(latest.measuredBy).toEqual({ removed: true })

        const oldest = page.items[1]!
        expect(oldest.source).toBe('typed')
        expect(oldest.measuredBy).toEqual({ id: scenario.activeUserId, name: 'Ana Conferente' })

        const serialized = JSON.stringify(page)
        expect(serialized).not.toContain('description')
        expect(serialized).not.toContain('05868574001090')
      })
    },
    60_000,
  )

  testWithPostgres(
    'filtra por período e pagina por cursor sem misturar empresas (isolamento de tenant)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const listPackageBoxMeasurements = buildUseCase(database)

        const otherCompanyPage = await listPackageBoxMeasurements.execute({
          companyId: scenario.otherCompanyId,
          cursor: null,
          from: undefined,
          limit: 20,
          to: undefined,
        })
        expect(otherCompanyPage.items).toHaveLength(0)

        const firstPage = await listPackageBoxMeasurements.execute({
          companyId: scenario.companyId,
          cursor: null,
          from: undefined,
          limit: 1,
          to: undefined,
        })
        expect(firstPage.items.map((item) => item.id)).toEqual([scenario.secondMeasurementId])
        expect(firstPage.nextCursor).not.toBeNull()

        const secondPage = await listPackageBoxMeasurements.execute({
          companyId: scenario.companyId,
          cursor: firstPage.nextCursor,
          from: undefined,
          limit: 1,
          to: undefined,
        })
        expect(secondPage.items.map((item) => item.id)).toEqual([scenario.firstMeasurementId])
        expect(secondPage.nextCursor).toBeNull()

        const windowed = await listPackageBoxMeasurements.execute({
          companyId: scenario.companyId,
          cursor: null,
          from: '2026-09-10T00:00:00.000Z',
          limit: 20,
          to: '2026-09-10T23:59:59.000Z',
        })
        expect(windowed.items.map((item) => item.id)).toEqual([scenario.firstMeasurementId])
      })
    },
    60_000,
  )
})

type Scenario = {
  readonly activeUserId: string
  readonly companyId: string
  readonly firstMeasurementId: string
  readonly otherCompanyId: string
  readonly replicatedMeasurementId: string
  readonly secondMeasurementId: string
}

/**
 * Uma caixa, duas medidas: a mais antiga (`typed`, ator com membership ativa) e a mais nova
 * (`camera`, ator sem membership ativa na empresa — "usuário removido"). Empresa B só existe para
 * provar o isolamento por `companyId`.
 */
async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const activeUserId = crypto.randomUUID()
  const removedUserId = crypto.randomUUID()
  const boxId = crypto.randomUUID()
  const firstMeasurementId = crypto.randomUUID()
  const secondMeasurementId = crypto.randomUUID()
  const replicatedMeasurementId = crypto.randomUUID()

  await database.db.insert(identityUsers).values([
    { id: activeUserId, status: 'active' },
    { id: removedUserId, status: 'disabled' },
  ])
  await database.db.insert(identityUserProfiles).values([
    {
      contactAddress: 'ana@example.com',
      contactChannel: 'email',
      name: 'Ana Conferente',
      userId: activeUserId,
      username: 'ana.conferente',
    },
    {
      contactAddress: 'ex@example.com',
      contactChannel: 'email',
      name: 'Ex Funcionário',
      userId: removedUserId,
      username: 'ex.funcionario',
    },
  ])
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])
  await database.db.insert(userCompanyMemberships).values([
    { companyId, id: crypto.randomUUID(), status: 'active', userId: activeUserId },
    // O ator da medida por câmera não tem mais vínculo ativo com esta empresa (H13).
    { companyId, id: crypto.randomUUID(), status: 'disabled', userId: removedUserId },
  ])
  await database.db.insert(nfePackageBoxes).values({
    commercialUnit: 'CX24',
    companyId,
    emitterTaxId: '05868574001090',
    id: boxId,
    productCode: '7896004003405',
  })

  await database.db.insert(nfePackageBoxMeasurements).values({
    companyId,
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
    heightMm: 200,
    id: firstMeasurementId,
    lengthMm: 300,
    measuredByUserId: activeUserId,
    packageBoxId: boxId,
    source: 'typed',
    widthMm: 100,
  })
  await database.db.insert(nfePackageBoxMeasurements).values({
    companyId,
    createdAt: new Date('2026-09-12T09:30:00.000Z'),
    engine: 'aruco-homography-v1',
    heightMarginMm: 5,
    heightMm: 198,
    id: secondMeasurementId,
    impreciseConfirmed: false,
    lengthMarginMm: 7,
    lengthMm: 301,
    measuredByUserId: removedUserId,
    packageBoxId: boxId,
    proposedHeightMm: 198,
    proposedLengthMm: 301,
    proposedWidthMm: 99,
    source: 'camera',
    warnings: ['steepAngle'],
    widthMarginMm: 4,
    widthMm: 99,
  })
  /**
   * Spec 155 (D6, ALTO-1 da revisão final): a caixa nunca foi medida de verdade — a dimensão veio
   * de uma irmã da família. Mais recente que as outras duas de propósito: sem o filtro do lado da
   * API, ela apareceria primeiro nesta mesma lista.
   */
  await database.db.insert(nfePackageBoxMeasurements).values({
    companyId,
    createdAt: new Date('2026-09-13T09:30:00.000Z'),
    heightMm: 198,
    id: replicatedMeasurementId,
    lengthMm: 301,
    measuredByUserId: activeUserId,
    packageBoxId: boxId,
    replicatedFromBoxId: boxId,
    source: 'replicated',
    widthMm: 99,
  })

  return {
    activeUserId,
    companyId,
    firstMeasurementId,
    otherCompanyId,
    replicatedMeasurementId,
    secondMeasurementId,
  }
}

function buildUseCase(database: TestDatabase) {
  return createListPackageBoxMeasurements({
    repository: new DrizzlePackageBoxMeasurementExportRepository(database.db),
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_export_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
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
