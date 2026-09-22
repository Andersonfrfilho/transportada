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
import {
  companies,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfePackageBoxes,
  nfeParticipants,
  nfeProducts,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { createRecordPackageBoxUnit } from '../../src/nfe-documents/application/record-package-box-unit.use-case'
import { resolveBoxDimensionsForCubage } from '../../src/nfe-documents/domain/package-box-cubage-dimensions.policy'
import { PackageBoxNotFoundError } from '../../src/nfe-documents/domain/package-box-measurement.error'
import { PackageBoxUnitRejectedError } from '../../src/nfe-documents/domain/package-box-unit.error'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'
import { DrizzlePackageBoxUnitRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box-unit.repository'
import { loadTripOccupancy } from '../../src/trips/infrastructure/trip-occupancy.support'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const EMITTER_TAX_ID = '05868574001090'
const PRODUCT_CODE = '7891'
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
    'T007: a ocupação e a planta usam a caixa estimada na falta da medida, e a marcam',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const cargo = await seedCargo(database, scenario)
        await createRecordPackageBoxUnit({
          repository: new DrizzlePackageBoxUnitRepository(database.db),
        }).execute({
          boxId: scenario.boxId,
          context: { companyId: scenario.companyId },
          source: 'typed',
          unit: LUX_UNIT,
        })

        const withEstimate = await loadTripOccupancy(database.db, {
          companyId: scenario.companyId,
          nfeDocumentIds: [cargo.documentId],
          vehicleId: cargo.vehicleId,
        })
        const [estimatedBox] = withEstimate.boxesByDocument.get(cargo.documentId) ?? []
        expect([estimatedBox?.lengthMm, estimatedBox?.widthMm, estimatedBox?.heightMm]).toEqual([
          188, 188, 128,
        ])
        // 48 unidades de 24 por caixa = 2 caixas de 0,004524 m³.
        expect(estimatedBox?.count).toBe(2)
        expect(withEstimate.volumeByDocument.get(cargo.documentId)).toBe('0.009048')
        // P3: a nota somou caixa estimada — a ocupação nunca sai como `measured`.
        expect(withEstimate.occupancy?.source).toBe('partial')
        // A estimativa não entra nas formas medidas nem na mediana da empresa.
        expect(withEstimate.measuredShapes).toEqual([])
        expect(withEstimate.fallbackBoxVolumeM3).toBeNull()

        await new DrizzlePackageBoxRepository(database.db).measure({
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
        const withMeasure = await loadTripOccupancy(database.db, {
          companyId: scenario.companyId,
          nfeDocumentIds: [cargo.documentId],
          vehicleId: cargo.vehicleId,
        })
        const [measuredBox] = withMeasure.boxesByDocument.get(cargo.documentId) ?? []
        expect([measuredBox?.lengthMm, measuredBox?.widthMm, measuredBox?.heightMm]).toEqual([
          190, 185, 130,
        ])
        expect(withMeasure.occupancy?.source).toBe('measured')
        // 190 × 185 × 130 mm = 0,0045695 m³ → 0.004570 (meio para cima, como o round do Postgres); × 2.
        expect(withMeasure.volumeByDocument.get(cargo.documentId)).toBe('0.009140')
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
    emitterTaxId: EMITTER_TAX_ID,
    id: boxId,
    productCode: PRODUCT_CODE,
    unitsPerBox: 24,
  })
  return { boxId, companyId, otherCompanyId, userId: crypto.randomUUID() }
}

async function seedCargo(
  database: TestDatabase,
  scenario: { readonly companyId: string; readonly userId: string },
): Promise<{ readonly documentId: string; readonly vehicleId: string }> {
  const vehicleId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = 'c'.repeat(64)
  await database.db.insert(identityUsers).values({ id: scenario.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: scenario.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: scenario.userId,
  })
  await database.db.insert(fleetVehicles).values({
    capacityM3: '48.000',
    cargoHeightM: '2.500',
    cargoLengthM: '8.000',
    cargoWidthM: '2.400',
    companyId: scenario.companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'three_quarter',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: scenario.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/package-box-unit-${documentId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: scenario.companyId,
    correlationId: `correlation-${importId}`,
    id: importId,
    idempotencyKey: `import-${importId}`,
    requestFingerprint: `fingerprint-${importId}`,
    requestedByUserId: scenario.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${String(Math.floor(Math.random() * 1e15)).padStart(15, '0')}${'1'.repeat(28)}`,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: scenario.companyId,
    createdByUserId: scenario.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-22T12:00:00.000Z'),
    model: '55',
    number: '163',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '100.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '100.0000',
    xmlObjectId,
    xmlSha256: sha,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: scenario.companyId,
    documentId,
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
  })
  await database.db.insert(nfeProducts).values({
    cfop: '5102',
    code: PRODUCT_CODE,
    commercialUnit: 'CX24',
    companyId: scenario.companyId,
    description: 'SAB LUX BOTANICALS 85G',
    documentId,
    ncm: '34011190',
    ordinal: 1n,
    quantity: '48.0000',
    totalValue: '100.0000',
    unitValue: '2.0833',
  })
  return { documentId, vehicleId }
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
