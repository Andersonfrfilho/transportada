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
  nfePackageBoxes,
  nfePackageBoxMeasurements,
} from '../../src/database/database.schema'
import { createListPackageBoxSiblings } from '../../src/nfe-documents/application/list-package-box-siblings.use-case'
import { createReplicatePackageBoxMeasurement } from '../../src/nfe-documents/application/replicate-package-box-measurement.use-case'
import {
  PackageBoxNotFoundError,
  PackageBoxReplicationSourceNotMeasuredError,
  PackageBoxReplicationTargetAlreadyMeasuredError,
  PackageBoxReplicationTargetOutsideFamilyError,
} from '../../src/nfe-documents/domain/package-box-measurement.error'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Spec 155 (D1, D3, D4, G003–G007): a família de `SAB FARNESE 180G` em `CX36` — mesmo caso do
 * operador (spec.md). `FR12` é o mesmo produto noutra embalagem: irmã de embalagem, nunca de
 * família, e nunca destino de réplica (D3).
 */
describe('irmãs e réplica de medida de caixa (spec 155 T2.3/T2.4)', () => {
  testWithPostgres(
    'GET siblings separa família de embalagem, e nunca vaza para outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const listSiblings = createListPackageBoxSiblings({
          repository: new DrizzlePackageBoxRepository(database.db),
        })

        const result = await listSiblings.execute({
          boxId: scenario.originId,
          context: { companyId: scenario.companyId },
        })

        expect(result.family.map((item) => item.id).sort()).toEqual(
          [scenario.familyPendingId, scenario.familyMeasuredId].sort(),
        )
        expect(result.packaging.map((item) => item.id)).toEqual([scenario.packagingSiblingId])
        // A embalagem irmã não é família: unidade comercial diferente muda a chave (D1).
        expect(result.family.map((item) => item.id)).not.toContain(scenario.packagingSiblingId)

        await expect(
          listSiblings.execute({
            boxId: scenario.originId,
            context: { companyId: scenario.otherCompanyId },
          }),
        ).rejects.toBeInstanceOf(PackageBoxNotFoundError)
      })
    },
    60_000,
  )

  testWithPostgres(
    'replica a medida da origem para o alvo, sem sobrescrever quem já tem medida (D4)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzlePackageBoxRepository(database.db)
        const replicate = createReplicatePackageBoxMeasurement({ repository })

        const result = await replicate.execute({
          boxId: scenario.originId,
          context: { companyId: scenario.companyId, userId: scenario.userId },
          targetIds: [scenario.familyPendingId],
        })
        expect(result).toEqual({ replicatedCount: 1 })

        const [target] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, scenario.familyPendingId))
        expect(target?.measurementSource).toBe('replicated')
        expect(target?.measurementMarginMm).toBeNull()
        expect(target?.lengthMm).toBe(300)
        expect(target?.widthMm).toBe(200)
        expect(target?.heightMm).toBe(150)
        expect(target?.grossWeightGrams).toBe(500)
        expect(target?.unitsPerBox).toBe(1)
        expect(target?.measuredAt).not.toBeNull()

        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, scenario.familyPendingId))
        expect(history).toHaveLength(1)
        expect(history[0]?.source).toBe('replicated')
        expect(history[0]?.replicatedFromBoxId).toBe(scenario.originId)
        expect(history[0]?.lengthMarginMm).toBeNull()
        expect(history[0]?.engine).toBeNull()

        // D4: replicar de novo na mesma caixa não grava nada — o alvo já tem medida.
        await expect(
          replicate.execute({
            boxId: scenario.originId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.familyPendingId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxReplicationTargetAlreadyMeasuredError)

        const historyAfterRetry = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, scenario.familyPendingId))
        expect(historyAfterRetry).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'recusa origem sem medida, alvo fora da família e alvo de outra empresa (G005)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const replicate = createReplicatePackageBoxMeasurement({
          repository: new DrizzlePackageBoxRepository(database.db),
        })

        await expect(
          replicate.execute({
            boxId: scenario.unmeasuredOriginId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.familyPendingId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxReplicationSourceNotMeasuredError)

        await expect(
          replicate.execute({
            boxId: scenario.originId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.outsideFamilyId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxReplicationTargetOutsideFamilyError)

        await expect(
          replicate.execute({
            boxId: scenario.originId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.otherCompanyBoxId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxNotFoundError)

        // Nada foi gravado em nenhum dos três caminhos de recusa.
        const [target] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, scenario.outsideFamilyId))
        expect(target?.measuredAt).toBeNull()
      })
    },
    60_000,
  )

  /**
   * Spec 155 D1: a família é `(emitente, prefixo, uCom)`. Dois emitentes que escrevem o mesmo
   * prefixo não são a mesma caixa física — nem irmãs, nem destino de réplica.
   */
  testWithPostgres(
    'caixa de outro emitente com o mesmo prefixo não é irmã nem alvo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzlePackageBoxRepository(database.db)

        const siblings = await createListPackageBoxSiblings({ repository }).execute({
          boxId: scenario.originId,
          context: { companyId: scenario.companyId },
        })
        expect(siblings.family.map((item) => item.id)).not.toContain(scenario.otherEmitterBoxId)

        await expect(
          createReplicatePackageBoxMeasurement({ repository }).execute({
            boxId: scenario.originId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.otherEmitterBoxId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxReplicationTargetOutsideFamilyError)
      })
    },
    60_000,
  )

  testWithPostgres(
    'origem e alvo sem família nenhuma não viram família por coincidência de chave vazia',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)

        await expect(
          createReplicatePackageBoxMeasurement({
            repository: new DrizzlePackageBoxRepository(database.db),
          }).execute({
            boxId: scenario.familylessMeasuredId,
            context: { companyId: scenario.companyId, userId: scenario.userId },
            targetIds: [scenario.familylessPendingId],
          }),
        ).rejects.toBeInstanceOf(PackageBoxReplicationTargetOutsideFamilyError)
      })
    },
    60_000,
  )

  /**
   * D4 sob concorrência: o conferente mede o alvo enquanto a réplica está a caminho. A leitura da
   * réplica ainda vê o alvo vazio; a gravação dela não pode passar por cima da medida conferida.
   */
  testWithPostgres(
    'medida gravada durante a réplica não é sobrescrita (D4)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const replicate = createReplicatePackageBoxMeasurement({
          repository: new DrizzlePackageBoxRepository(database.db),
        })

        let releaseMeasurement: () => void = () => undefined
        const measurementReleased = new Promise<void>((resolve) => {
          releaseMeasurement = resolve
        })
        let markMeasurementLocked: () => void = () => undefined
        const measurementLocked = new Promise<void>((resolve) => {
          markMeasurementLocked = resolve
        })

        const concurrentMeasurement = database.db.transaction(async (transaction) => {
          await transaction
            .update(nfePackageBoxes)
            .set({
              heightMm: 99,
              lengthMm: 99,
              measuredAt: new Date(),
              measurementSource: 'typed',
              widthMm: 99,
            })
            .where(eq(nfePackageBoxes.id, scenario.familyPendingId))
          markMeasurementLocked()
          await measurementReleased
        })
        await measurementLocked

        const replication = replicate.execute({
          boxId: scenario.originId,
          context: { companyId: scenario.companyId, userId: scenario.userId },
          targetIds: [scenario.familyPendingId],
        })
        const settledReplication = replication.then(
          () => undefined,
          (error: unknown) => error,
        )
        await Bun.sleep(500)
        releaseMeasurement()
        await concurrentMeasurement

        expect(await settledReplication).toBeInstanceOf(
          PackageBoxReplicationTargetAlreadyMeasuredError,
        )
        const [target] = await database.db
          .select()
          .from(nfePackageBoxes)
          .where(eq(nfePackageBoxes.id, scenario.familyPendingId))
        expect(target?.lengthMm).toBe(99)
        expect(target?.measurementSource).toBe('typed')
        const history = await database.db
          .select()
          .from(nfePackageBoxMeasurements)
          .where(eq(nfePackageBoxMeasurements.packageBoxId, scenario.familyPendingId))
        expect(history).toHaveLength(0)
      })
    },
    60_000,
  )
})

type Scenario = {
  readonly companyId: string
  readonly familyMeasuredId: string
  readonly familyPendingId: string
  readonly familylessMeasuredId: string
  readonly familylessPendingId: string
  readonly otherEmitterBoxId: string
  readonly originId: string
  readonly otherCompanyBoxId: string
  readonly otherCompanyId: string
  readonly outsideFamilyId: string
  readonly packagingSiblingId: string
  readonly unmeasuredOriginId: string
  readonly userId: string
}

async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const emitterTaxId = '05868574001090'

  const originId = crypto.randomUUID()
  const familyPendingId = crypto.randomUUID()
  const familyMeasuredId = crypto.randomUUID()
  const outsideFamilyId = crypto.randomUUID()
  const packagingSiblingId = crypto.randomUUID()
  const unmeasuredOriginId = crypto.randomUUID()
  const otherCompanyBoxId = crypto.randomUUID()
  const otherEmitterBoxId = crypto.randomUUID()
  const familylessMeasuredId = crypto.randomUUID()
  const familylessPendingId = crypto.randomUUID()

  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])

  const measured = {
    grossWeightGrams: 500,
    heightMm: 150,
    lengthMm: 300,
    measuredAt: new Date('2026-09-16T12:00:00.000Z'),
    measurementSource: 'typed' as const,
    unitsPerBox: 1,
    widthMm: 200,
  }

  await database.db.insert(nfePackageBoxes).values([
    {
      commercialUnit: 'CX36',
      companyId,
      description: 'SAB FARNESE 180G PURO E HIDRATAN',
      emitterTaxId,
      id: originId,
      productCode: '6958',
      ...measured,
    },
    {
      commercialUnit: 'CX36',
      companyId,
      description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
      emitterTaxId,
      id: familyPendingId,
      productCode: '6959',
    },
    {
      commercialUnit: 'CX36',
      companyId,
      description: 'SAB FARNESE 180G LAVANDA E MENTA',
      emitterTaxId,
      id: familyMeasuredId,
      productCode: '6960',
      ...measured,
    },
    {
      commercialUnit: 'CX180',
      companyId,
      description: 'REFR TANG 18G MANGA',
      emitterTaxId,
      id: outsideFamilyId,
      productCode: '7001',
    },
    // Mesmo produto da origem, embalagem diferente: irmã de embalagem (D3), nunca de família.
    {
      commercialUnit: 'FR12',
      companyId,
      description: 'SAB FARNESE 180G PURO E HIDRATAN',
      emitterTaxId,
      id: packagingSiblingId,
      productCode: '6958',
    },
    // Fora da família e do grupo de embalagem da origem de propósito: só serve para o caso "origem
    // sem medida" (G005) e não pode interferir nos contadores de irmãs testados acima.
    {
      commercialUnit: 'CX25',
      companyId,
      description: 'LEITE PO ITAMBE 400G',
      emitterTaxId,
      id: unmeasuredOriginId,
      productCode: '9001',
    },
    // Mesmo texto e unidade da família, emitente diferente: outra caixa física (D1).
    {
      commercialUnit: 'CX36',
      companyId,
      description: 'SAB FARNESE 180G ERVA DOCE HORTE',
      emitterTaxId: '11222333000181',
      id: otherEmitterBoxId,
      productCode: '6961',
    },
    // Sem família (prefixo genérico): nenhuma das duas tem com quem replicar.
    {
      commercialUnit: 'CX12',
      companyId,
      description: 'ALCOOL FLOPS 1L 46.2',
      emitterTaxId,
      id: familylessMeasuredId,
      productCode: '8001',
      ...measured,
    },
    {
      commercialUnit: 'CX12',
      companyId,
      description: '3M ESPONJA MULTI USO',
      emitterTaxId,
      id: familylessPendingId,
      productCode: '8002',
    },
    {
      commercialUnit: 'CX36',
      companyId: otherCompanyId,
      description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
      emitterTaxId,
      id: otherCompanyBoxId,
      productCode: '6959',
    },
  ])

  return {
    companyId,
    familyMeasuredId,
    familyPendingId,
    familylessMeasuredId,
    familylessPendingId,
    originId,
    otherCompanyBoxId,
    otherCompanyId,
    otherEmitterBoxId,
    outsideFamilyId,
    packagingSiblingId,
    unmeasuredOriginId,
    userId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_replicate_${crypto.randomUUID().replaceAll('-', '')}`
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
