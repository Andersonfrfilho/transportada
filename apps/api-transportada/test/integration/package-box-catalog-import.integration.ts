/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162 — CA03 (medida humana intocável), CA04 (simulação não grava), CA05 (idempotência),
 * CA06 (mesmo GTIN, duas empresas, cada uma recebe a sua proposta).
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  nfePackageBoxes,
  nfePackageBoxMeasurements,
} from '../../src/database/database.schema'
import { createImportPackageBoxCatalog } from '../../src/nfe-documents/application/import-package-box-catalog.use-case'
import { DrizzlePackageBoxCatalogImportRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box-catalog-import.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMMERCIAL_UNIT = 'CX12'
const EMITTER_TAX_ID = '05868574001090'
const CARTON_GTIN = '67891150059841'

function foundLine(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    cartonGtin: CARTON_GTIN,
    extracted: {
      edges: {
        altura: { unit: 'cm', value: '20,0 cm' },
        comprimento: { unit: 'cm', value: '30,0 cm' },
        largura: { unit: 'cm', value: '16,0 cm' },
      },
      grossWeight: { unit: 'kg', value: '1,000 kg' },
      unitsPerCarton: 12,
    },
    pageUrl: 'https://cosmos.bluesoft.com.br/produtos/7891150059849',
    source: 'cosmos',
    status: 'found',
    unitGtin: '7891150059849',
    ...overrides,
  })
}

describe('importar medidas de catálogo (Postgres, spec 162)', () => {
  testWithPostgres('CA03: caixa já medida não muda em nenhum caminho', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const boxId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      await database.db.insert(nfePackageBoxes).values({
        cartonGtin: CARTON_GTIN,
        commercialUnit: COMMERCIAL_UNIT,
        companyId,
        description: 'JA MEDIDA',
        emitterTaxId: EMITTER_TAX_ID,
        grossWeightGrams: 900,
        heightMm: 111,
        id: boxId,
        lengthMm: 222,
        measuredAt: new Date('2026-09-16T12:00:00.000Z'),
        measurementSource: 'typed',
        productCode: 'P1',
        widthMm: 333,
      })

      const importUseCase = createImportPackageBoxCatalog({
        repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
      })
      const report = await importUseCase.execute({ apply: true, lines: [foundLine()] })

      expect(report.outcomes.no_matching_box).toBe(1)
      const [box] = await database.db
        .select()
        .from(nfePackageBoxes)
        .where(eq(nfePackageBoxes.id, boxId))
      expect(box?.lengthMm).toBe(222)
      expect(box?.measurementSource).toBe('typed')
    })
  })

  testWithPostgres('CA04: simulação (apply: false) não deixa nenhuma linha gravada', async () => {
    await withDisposableDatabase(async (database) => {
      const { boxId } = await seedPendingBox(database)

      const importUseCase = createImportPackageBoxCatalog({
        repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
      })
      const report = await importUseCase.execute({ apply: false, lines: [foundLine()] })

      expect(report.outcomes.proposed).toBe(1)
      const [box] = await database.db
        .select()
        .from(nfePackageBoxes)
        .where(eq(nfePackageBoxes.id, boxId))
      expect(box?.lengthMm).toBeNull()
      const measurements = await database.db.select().from(nfePackageBoxMeasurements)
      expect(measurements).toHaveLength(0)
    })
  })

  testWithPostgres(
    'CA05: rodar o mesmo JSONL duas vezes com --apply não duplica a proposta',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seedPendingBox(database)

        const importUseCase = createImportPackageBoxCatalog({
          repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
        })
        const first = await importUseCase.execute({ apply: true, lines: [foundLine()] })
        const second = await importUseCase.execute({ apply: true, lines: [foundLine()] })

        expect(first.outcomes.proposed).toBe(1)
        expect(second.outcomes.duplicate).toBe(1)
        expect(second.outcomes.proposed).toBe(0)
        const measurements = await database.db.select().from(nfePackageBoxMeasurements)
        expect(measurements).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'CA06: o mesmo GTIN em caixas de empresas diferentes recebe cada uma a sua proposta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyA = crypto.randomUUID()
        const companyB = crypto.randomUUID()
        const boxA = crypto.randomUUID()
        const boxB = crypto.randomUUID()
        await database.db.insert(companies).values([
          { id: companyA, status: 'active' },
          { id: companyB, status: 'active' },
        ])
        await database.db.insert(nfePackageBoxes).values([
          {
            cartonGtin: CARTON_GTIN,
            commercialUnit: COMMERCIAL_UNIT,
            companyId: companyA,
            description: 'CAIXA A',
            emitterTaxId: EMITTER_TAX_ID,
            id: boxA,
            productCode: 'PA',
          },
          {
            cartonGtin: CARTON_GTIN,
            commercialUnit: COMMERCIAL_UNIT,
            companyId: companyB,
            description: 'CAIXA B',
            emitterTaxId: EMITTER_TAX_ID,
            id: boxB,
            productCode: 'PB',
          },
        ])

        const importUseCase = createImportPackageBoxCatalog({
          repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
        })
        const report = await importUseCase.execute({ apply: true, lines: [foundLine()] })

        expect(report.outcomes.proposed).toBe(2)
        const measurements = await database.db.select().from(nfePackageBoxMeasurements)
        expect(measurements).toHaveLength(2)
        expect(new Set(measurements.map((row) => row.companyId))).toEqual(
          new Set([companyA, companyB]),
        )
      })
    },
  )

  testWithPostgres(
    'linha torta (spec 160) é rejeitada pela sanidade e listada com o código — nada é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seedPendingBox(database)

        const importUseCase = createImportPackageBoxCatalog({
          repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
        })
        const report = await importUseCase.execute({
          apply: true,
          lines: [
            foundLine({
              extracted: {
                edges: {
                  altura: { unit: 'cm', value: '240,0 cm' },
                  comprimento: { unit: 'cm', value: '474,0 cm' },
                  largura: { unit: 'cm', value: '247,0 cm' },
                },
                grossWeight: { unit: 'kg', value: '0,015 kg' },
              },
            }),
          ],
        })

        expect(report.sanityRejected).toBe(1)
        expect(report.rejections[0]?.codes).toContain('EDGE_TOO_LARGE')
        const measurements = await database.db.select().from(nfePackageBoxMeasurements)
        expect(measurements).toHaveLength(0)
      })
    },
  )

  testWithPostgres(
    'spec 163 RF05: linha só com unidade grava a unidade e a estimativa, nunca a medida',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId } = await seedPendingBox(database)
        await database.db
          .update(nfePackageBoxes)
          .set({ unitsPerBox: 24 })
          .where(eq(nfePackageBoxes.id, boxId))
        const importUseCase = createImportPackageBoxCatalog({
          repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
        })

        const simulated = await importUseCase.execute({ apply: false, lines: [unitOnlyLine()] })
        expect(simulated.outcomes.unit_recorded).toBe(1)
        expect(simulated.ignoredStatus).toBe(0)
        const [untouched] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(untouched?.unitLengthMm).toBeNull()

        const report = await importUseCase.execute({ apply: true, lines: [unitOnlyLine()] })
        expect(report.outcomes.unit_recorded).toBe(1)
        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect([box?.unitLengthMm, box?.unitWidthMm, box?.unitHeightMm]).toEqual([60, 90, 30])
        expect(box?.unitGrossWeightGrams).toBe(85)
        expect(box?.unitMeasurementSource).toBe('manual:www.drogaria.com.br')
        expect(box?.estimatedArrangement).toBe('2x2x6')
        expect(box?.estimatedLengthMm).toBe(188)
        // RNF02: a medida real segue vazia, e nenhum histórico de medida nasce da unidade.
        expect(box?.lengthMm).toBeNull()
        expect(box?.measurementSource).toBeNull()
        expect(await database.db.select().from(nfePackageBoxMeasurements)).toHaveLength(0)
      })
    },
  )

  testWithPostgres(
    'spec 163 RF05: unidade digitada pelo conferente nunca é sobrescrita',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId } = await seedPendingBox(database)
        await database.db
          .update(nfePackageBoxes)
          .set({
            unitHeightMm: 40,
            unitLengthMm: 40,
            unitMeasurementSource: 'typed',
            unitWidthMm: 40,
          })
          .where(eq(nfePackageBoxes.id, boxId))
        const report = await createImportPackageBoxCatalog({
          repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
        }).execute({ apply: true, lines: [unitOnlyLine()] })

        expect(report.outcomes.unit_skipped_typed).toBe(1)
        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.unitLengthMm).toBe(40)
        expect(box?.unitMeasurementSource).toBe('typed')
      })
    },
  )
})

function unitOnlyLine(): string {
  return JSON.stringify({
    cartonGtin: CARTON_GTIN,
    extracted: {
      edges: {},
      unitEdges: {
        lado1: { unit: 'cm', value: '6' },
        lado2: { unit: 'cm', value: '9' },
        lado3: { unit: 'cm', value: '3' },
      },
      unitGrossWeight: { unit: 'g', value: '85' },
    },
    pageUrl: 'https://www.drogaria.com.br/lux-85g',
    source: 'www.drogaria.com.br',
    status: 'found_unit_manual',
    unitGtin: '7891150059849',
  })
}

async function seedPendingBox(
  database: TestDatabase,
): Promise<{ boxId: string; companyId: string }> {
  const companyId = crypto.randomUUID()
  const boxId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(nfePackageBoxes).values({
    cartonGtin: CARTON_GTIN,
    commercialUnit: COMMERCIAL_UNIT,
    companyId,
    description: 'CAIXA PENDENTE',
    emitterTaxId: EMITTER_TAX_ID,
    id: boxId,
    productCode: 'P1',
  })
  return { boxId, companyId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_catalog_import_${crypto.randomUUID().replaceAll('-', '')}`
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
        await admin.close()
      }
    }
  }
}
