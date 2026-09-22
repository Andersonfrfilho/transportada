/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163 — CA05 (a estimativa nunca vira medida; medida real faz a cubagem ignorar a
 * estimativa) e CA06 (isolamento entre empresas), contra Postgres.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import { companies, nfePackageBoxes } from '../../src/database/database.schema'
import { createRecordPackageBoxUnit } from '../../src/nfe-documents/application/record-package-box-unit.use-case'
import { resolveBoxDimensionsForCubage } from '../../src/nfe-documents/domain/package-box-cubage-dimensions.policy'
import { PackageBoxNotFoundError } from '../../src/nfe-documents/domain/package-box-measurement.error'
import { PackageBoxUnitRejectedError } from '../../src/nfe-documents/domain/package-box-unit.error'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'
import { DrizzlePackageBoxUnitRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box-unit.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const LUX_UNIT = { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 } as const

describe('medida da unidade e caixa estimada (spec 163, T006)', () => {
  testWithPostgres(
    'CA05: a estimativa não altera length_mm; a medida real faz a cubagem ignorar a estimativa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const recordUnit = createRecordPackageBoxUnit({
          repository: new DrizzlePackageBoxUnitRepository(database.db),
        })

        await recordUnit.execute({
          boxId: scenario.boxId,
          context: { companyId: scenario.companyId },
          source: 'typed',
          unit: LUX_UNIT,
        })

        const estimated = await readBox(database, scenario.boxId)
        // RNF02: nada da medida real foi escrito pela estimativa.
        expect(estimated.lengthMm).toBeNull()
        expect(estimated.widthMm).toBeNull()
        expect(estimated.heightMm).toBeNull()
        expect(estimated.measuredAt).toBeNull()
        expect(estimated.measurementSource).toBeNull()
        expect(estimated.unitLengthMm).toBe(60)
        expect(estimated.unitMeasurementSource).toBe('typed')
        expect(estimated.estimatedArrangement).toBe('2x2x6')
        expect([
          estimated.estimatedLengthMm,
          estimated.estimatedWidthMm,
          estimated.estimatedHeightMm,
        ]).toEqual([188, 188, 128])
        expect(estimated.estimatedVolumeCm3).toBe(4524)
        expect(estimated.estimatedGrossWeightGrams).toBe(2142)
        expect(resolveBoxDimensionsForCubage(estimated)).toEqual({
          dims: { heightMm: 128, lengthMm: 188, widthMm: 188 },
          isEstimated: true,
        })

        const measured = await new DrizzlePackageBoxRepository(database.db).measure({
          boxId: scenario.boxId,
          companyId: scenario.companyId,
          measuredByUserId: scenario.userId,
          measurement: {
            grossWeightGrams: 2300,
            heightMm: 130,
            lengthMm: 190,
            source: 'typed',
            unitsPerBox: 24,
            widthMm: 185,
          },
          measurementMarginMm: null,
        })
        expect(measured).toBe(true)

        const afterMeasure = await readBox(database, scenario.boxId)
        // A estimativa não é apagada — só deixa de ser lida pela cubagem.
        expect(afterMeasure.estimatedLengthMm).toBe(188)
        expect(resolveBoxDimensionsForCubage(afterMeasure)).toEqual({
          dims: { heightMm: 130, lengthMm: 190, widthMm: 185 },
          isEstimated: false,
        })

        // RF04: com medida real, gravar outra unidade não recalcula a estimativa.
        await recordUnit.execute({
          boxId: scenario.boxId,
          context: { companyId: scenario.companyId },
          source: 'catalog',
          unit: { heightMm: 40, lengthMm: 40, widthMm: 40 },
        })
        const afterSecondUnit = await readBox(database, scenario.boxId)
        expect(afterSecondUnit.unitLengthMm).toBe(40)
        expect(afterSecondUnit.estimatedArrangement).toBe('2x2x6')
        expect(afterSecondUnit.lengthMm).toBe(190)
        expect(afterSecondUnit.measurementSource).toBe('typed')
      })
    },
    60_000,
  )

  testWithPostgres(
    'CA06: a unidade de uma empresa nunca grava na caixa da outra',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const recordUnit = createRecordPackageBoxUnit({
          repository: new DrizzlePackageBoxUnitRepository(database.db),
        })

        await expect(
          recordUnit.execute({
            boxId: scenario.boxId,
            context: { companyId: scenario.otherCompanyId },
            source: 'typed',
            unit: LUX_UNIT,
          }),
        ).rejects.toBeInstanceOf(PackageBoxNotFoundError)

        const untouched = await readBox(database, scenario.boxId)
        expect(untouched.unitLengthMm).toBeNull()
        expect(untouched.estimatedLengthMm).toBeNull()

        const repository = new DrizzlePackageBoxUnitRepository(database.db)
        expect(
          await repository.saveUnit({
            boxId: scenario.boxId,
            companyId: scenario.otherCompanyId,
            estimate: null,
            unit: LUX_UNIT,
            unitSource: 'typed',
          }),
        ).toBe(false)
        expect((await readBox(database, scenario.boxId)).unitLengthMm).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'CA03: unidade de 2160 mm é rejeitada e nada é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const recordUnit = createRecordPackageBoxUnit({
          repository: new DrizzlePackageBoxUnitRepository(database.db),
        })
        await expect(
          recordUnit.execute({
            boxId: scenario.boxId,
            context: { companyId: scenario.companyId },
            source: 'typed',
            unit: { ...LUX_UNIT, heightMm: 2160 },
          }),
        ).rejects.toBeInstanceOf(PackageBoxUnitRejectedError)
        expect((await readBox(database, scenario.boxId)).unitHeightMm).toBeNull()
      })
    },
    60_000,
  )
})

async function readBox(database: TestDatabase, boxId: string) {
  const [row] = await database.db
    .select()
    .from(nfePackageBoxes)
    .where(eq(nfePackageBoxes.id, boxId))
    .limit(1)
  if (row === undefined) throw new Error('package box not found')
  return row
}

async function seedScenario(database: TestDatabase): Promise<{
  readonly boxId: string
  readonly companyId: string
  readonly otherCompanyId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const boxId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])
  await database.db.insert(nfePackageBoxes).values({
    commercialUnit: 'CX24',
    companyId,
    description: 'SAB LUX BOTANICALS 85G',
    emitterTaxId: '05868574001090',
    id: boxId,
    productCode: '7891',
    unitsPerBox: 24,
  })
  return { boxId, companyId, otherCompanyId, userId: crypto.randomUUID() }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_unit_${crypto.randomUUID().replaceAll('-', '')}`
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
