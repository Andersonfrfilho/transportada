/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  companyCargoSettings,
  nfePackageBoxes,
  nfePackageBoxMeasurements,
} from '../../src/database/database.schema'
import { createMeasurePackageBox } from '../../src/nfe-documents/application/measure-package-box.use-case'
import { PackageBoxCameraMeasurementDisabledError } from '../../src/nfe-documents/domain/package-box-measurement.error'
import { DrizzleCameraMeasurementSettingsRepository } from '../../src/nfe-documents/infrastructure/drizzle-camera-measurement-settings.repository'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Spec 152 (D5, D14, D17, experimental): a rota grava a caixa **e** o histórico append-only na
 * mesma transação, o ator vem sempre do contexto autenticado, e a função desligada recusa
 * `source ≠ typed` com 422 — mesmo para uma caixa que já existia antes desta spec.
 */
describe('a caixa e o histórico da medida (spec 152, R5/R7)', () => {
  testWithPostgres(
    'grava origem e margem na caixa, e uma linha no histórico com a proposta da câmera',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId, companyId } = await seedCompanyWithBox(database, {
          cameraMeasurementEnabled: true,
        })
        const measurePackageBox = buildMeasurePackageBox(database)

        const measured = await measurePackageBox.execute({
          boxId,
          context: { companyId, userId: crypto.randomUUID() },
          measurement: {
            camera: {
              engine: 'aruco-homography-v1',
              heightMarginMm: 5,
              impreciseConfirmed: false,
              lengthMarginMm: 7,
              proposedHeightMm: 198,
              proposedLengthMm: 301,
              proposedWidthMm: 99,
              warnings: ['steepAngle'],
              widthMarginMm: 4,
            },
            grossWeightGrams: null,
            heightMm: 200,
            lengthMm: 300,
            source: 'camera',
            unitsPerBox: 1,
            widthMm: 100,
          },
        })

        expect(measured).toBe(true)

        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.measurementSource).toBe('camera')
        expect(box?.measurementMarginMm).toBe(7)
        expect(box?.lengthMm).toBe(300)

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(1)
        expect(history[0]?.source).toBe('camera')
        expect(history[0]?.proposedLengthMm).toBe(301)
        expect(history[0]?.warnings).toEqual(['steepAngle'])
        expect(history[0]?.engine).toBe('aruco-homography-v1')
      })
    },
    60_000,
  )

  /**
   * ⚠️ **O caminho D6 nunca tinha sido exercitado contra o Postgres.** É o corpo exato do 2º caso da
   * fixture de fronteira: a câmera não leu a altura (margem 45 mm, acima do teto), o campo nasceu
   * vazio e o conferente digitou 45 cm com a fita. A caixa guarda a incerteza do que a **câmera**
   * mediu — 7 mm, do comprimento — e não os 45 mm de uma dimensão que a câmera nem propôs (3ª
   * revisão); a proposta de altura fica nula no histórico, porque nunca existiu.
   */
  testWithPostgres(
    'D6: a altura não lida pela câmera fica sem proposta no histórico, e não vira a margem da caixa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId, companyId } = await seedCompanyWithBox(database, {
          cameraMeasurementEnabled: true,
        })
        const measurePackageBox = buildMeasurePackageBox(database)

        const measured = await measurePackageBox.execute({
          boxId,
          context: { companyId, userId: crypto.randomUUID() },
          measurement: {
            camera: {
              engine: 'aruco-homography-v1',
              heightMarginMm: 45,
              impreciseConfirmed: false,
              lengthMarginMm: 7,
              proposedLengthMm: 599,
              proposedWidthMm: 401,
              warnings: [],
              widthMarginMm: 4,
            },
            grossWeightGrams: null,
            heightMm: 450,
            lengthMm: 599,
            source: 'camera_adjusted',
            unitsPerBox: 1,
            widthMm: 401,
          },
        })

        expect(measured).toBe(true)

        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.measurementSource).toBe('camera_adjusted')
        expect(box?.measurementMarginMm).toBe(7)
        expect(box?.heightMm).toBe(450)

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(1)
        expect(history[0]?.proposedHeightMm).toBeNull()
        expect(history[0]?.heightMarginMm).toBe(45)
        expect(history[0]?.proposedLengthMm).toBe(599)
      })
    },
    60_000,
  )

  /**
   * MÉDIO-1 (T14, 4ª revisão): o corpo de fronteira que zera `measurement_margin_mm` nunca tinha
   * sido exercitado contra o Postgres — o 7º caso da fixture compartilhada, com as três dimensões
   * digitadas por cima da proposta (nenhuma coincidindo com o valor gravado). Também prova que a
   * gravação não colide com o CHECK de pareamento (`measurement_source <> 'typed' or
   * measurement_margin_mm is null`): margem nula é sempre aceita, mesmo com origem não-`typed`.
   */
  testWithPostgres(
    'D16: as três dimensões digitadas por cima zeram a margem da caixa, mesmo com camera_adjusted',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId, companyId } = await seedCompanyWithBox(database, {
          cameraMeasurementEnabled: true,
        })
        const measurePackageBox = buildMeasurePackageBox(database)

        const measured = await measurePackageBox.execute({
          boxId,
          context: { companyId, userId: crypto.randomUUID() },
          measurement: {
            camera: {
              engine: 'aruco-homography-v1',
              heightMarginMm: 20,
              impreciseConfirmed: false,
              lengthMarginMm: 25,
              proposedHeightMm: 352,
              proposedLengthMm: 599,
              proposedWidthMm: 401,
              warnings: [],
              widthMarginMm: 15,
            },
            grossWeightGrams: null,
            heightMm: 360,
            lengthMm: 610,
            source: 'camera_adjusted',
            unitsPerBox: 1,
            widthMm: 410,
          },
        })

        expect(measured).toBe(true)

        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.measurementSource).toBe('camera_adjusted')
        expect(box?.measurementMarginMm).toBeNull()
        expect(box?.heightMm).toBe(360)
        expect(box?.lengthMm).toBe(610)
        expect(box?.widthMm).toBe(410)

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(1)
        expect(history[0]?.heightMarginMm).toBe(20)
        expect(history[0]?.lengthMarginMm).toBe(25)
        expect(history[0]?.widthMarginMm).toBe(15)
        expect(history[0]?.proposedHeightMm).toBe(352)
        expect(history[0]?.proposedLengthMm).toBe(599)
        expect(history[0]?.proposedWidthMm).toBe(401)
      })
    },
    60_000,
  )

  testWithPostgres(
    'o corpo antigo (sem source) continua gravando typed, sem margem e sem histórico de câmera',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId, companyId } = await seedCompanyWithBox(database, {
          cameraMeasurementEnabled: false,
        })
        const measurePackageBox = buildMeasurePackageBox(database)

        const measured = await measurePackageBox.execute({
          boxId,
          context: { companyId, userId: crypto.randomUUID() },
          measurement: {
            grossWeightGrams: null,
            heightMm: 200,
            lengthMm: 300,
            source: 'typed',
            unitsPerBox: 1,
            widthMm: 100,
          },
        })

        expect(measured).toBe(true)

        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.measurementSource).toBe('typed')
        expect(box?.measurementMarginMm).toBeNull()

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(1)
        expect(history[0]?.engine).toBeNull()
        expect(history[0]?.lengthMarginMm).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'a função desligada recusa source camera com 422, e nada é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId, companyId } = await seedCompanyWithBox(database, {
          cameraMeasurementEnabled: false,
        })
        const measurePackageBox = buildMeasurePackageBox(database)

        await expect(
          measurePackageBox.execute({
            boxId,
            context: { companyId, userId: crypto.randomUUID() },
            measurement: {
              camera: {
                engine: 'aruco-homography-v1',
                impreciseConfirmed: false,
                warnings: [],
              },
              grossWeightGrams: null,
              heightMm: 200,
              lengthMm: 300,
              source: 'camera',
              unitsPerBox: 1,
              widthMm: 100,
            },
          }),
        ).rejects.toThrow(PackageBoxCameraMeasurementDisabledError)

        const [box] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, boxId))
        expect(box?.measurementSource).toBeNull()
        expect(box?.lengthMm).toBeNull()

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(0)
      })
    },
    60_000,
  )

  testWithPostgres(
    'caixa de outra empresa devolve false (404 na rota) e não grava histórico (contrato de tenant)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { boxId } = await seedCompanyWithBox(database, { cameraMeasurementEnabled: true })
        const otherCompanyId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: otherCompanyId, status: 'active' })
        const measurePackageBox = buildMeasurePackageBox(database)

        const measured = await measurePackageBox.execute({
          boxId,
          context: { companyId: otherCompanyId, userId: crypto.randomUUID() },
          measurement: {
            grossWeightGrams: null,
            heightMm: 200,
            lengthMm: 300,
            source: 'typed',
            unitsPerBox: 1,
            widthMm: 100,
          },
        })

        expect(measured).toBe(false)

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, boxId))
        expect(history).toHaveLength(0)
      })
    },
    60_000,
  )
})

function buildMeasurePackageBox(database: TestDatabase) {
  return createMeasurePackageBox({
    cameraMeasurementSettings: new DrizzleCameraMeasurementSettingsRepository(database.db),
    repository: new DrizzlePackageBoxRepository(database.db),
  })
}

async function seedCompanyWithBox(
  database: TestDatabase,
  options: { readonly cameraMeasurementEnabled: boolean },
): Promise<{ readonly boxId: string; readonly companyId: string }> {
  const companyId = crypto.randomUUID()
  const boxId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db
    .insert(companyCargoSettings)
    .values({ cameraMeasurementEnabled: options.cameraMeasurementEnabled, companyId })
  await database.db.insert(nfePackageBoxes).values({
    commercialUnit: 'CX24',
    companyId,
    emitterTaxId: '05868574001090',
    id: boxId,
    productCode: '7896004003405',
  })

  return { boxId, companyId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_${crypto.randomUUID().replaceAll('-', '')}`
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
