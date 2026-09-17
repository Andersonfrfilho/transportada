/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { nfePackageBoxes } from '../src/database/nfe.schema.js'
import { writePackageBoxes } from '../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import { DrizzleNfePackageBoxBackfillRepository } from '../src/nfe-imports/infrastructure/drizzle-nfe-package-box-backfill.repository.js'
import { DrizzleNfePackageBoxGtinBackfillRepository } from '../src/nfe-imports/infrastructure/drizzle-nfe-package-box-gtin-backfill.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const EMITTER = '05868574001090'

/**
 * ⚠️ O schema do worker é cópia por valor do da API (T2.1: a coluna `measurement_source` nunca
 * chegou aqui) — `nfePackageBoxes` do worker não declara `units_per_box`, `measurement_source` nem
 * `measurement_margin_mm`. O Postgres tem as três (a API as criou); esta suíte lê e grava por SQL
 * cru onde o schema tipado do worker não alcança, só para provar que os três caminhos de escrita do
 * worker nunca as tocam.
 */
type MeasuredColumns = {
  readonly cartonGtin: string | null
  readonly grossWeightGrams: number | null
  readonly heightMm: number | null
  readonly lengthMm: number | null
  readonly measuredAt: Date | null
  readonly measurementMarginMm: number | null
  readonly measurementSource: string | null
  readonly unitsPerBox: number
  readonly widthMm: number | null
}

/**
 * Spec 155 (G007): a caixa medida antes da spec não muda de `measurement_source` nem perde medida
 * quando a mesma NF-e (ou uma nota do mesmo produto) reentra pelos três caminhos que já escrevem
 * `nfe_package_boxes` — o consumer da importação, o backfill de caixas e o backfill de GTIN. As
 * garantias já existiam por construção (T0/spec.md); esta suíte é o teste com esse nome que faltava.
 */
describeDatabase('a reimportação não reescreve caixa já medida (spec 155 G007)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const companyId = crypto.randomUUID()

  const typedBoxId = crypto.randomUUID()
  const replicatedBoxId = crypto.randomUUID()

  /** `typed` nunca carrega margem (CHECK `nfe_package_boxes_measurement_margin_pairing_check`). */
  const typedBox = {
    commercialUnit: 'CX36',
    grossWeightGrams: 500,
    heightMm: 150,
    lengthMm: 300,
    measuredAt: new Date('2026-09-10T12:00:00.000Z'),
    measurementMarginMm: null,
    measurementSource: 'typed' as const,
    productCode: '6958',
    unitsPerBox: 1,
    widthMm: 200,
  }

  /** D6: `replicated` nunca carrega margem — é o caso que o coordenador pediu para cobrir também. */
  const replicatedBox = {
    commercialUnit: 'CX36',
    grossWeightGrams: 500,
    heightMm: 150,
    lengthMm: 300,
    measuredAt: new Date('2026-09-17T09:00:00.000Z'),
    measurementMarginMm: null,
    measurementSource: 'replicated' as const,
    productCode: '6959',
    unitsPerBox: 1,
    widthMm: 200,
  }

  async function readMeasuredColumns(boxId: string): Promise<MeasuredColumns> {
    const rows = await db.execute<MeasuredColumns>(sql`
      select
        carton_gtin as "cartonGtin",
        gross_weight_grams as "grossWeightGrams",
        height_mm as "heightMm",
        length_mm as "lengthMm",
        measured_at as "measuredAt",
        measurement_margin_mm as "measurementMarginMm",
        measurement_source as "measurementSource",
        units_per_box as "unitsPerBox",
        width_mm as "widthMm"
      from nfe_package_boxes
      where id = ${boxId}
    `)
    const row = rows[0]
    if (row === undefined) throw new Error(`package box ${boxId} not found`)
    return row
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`
      insert into nfe_package_boxes
        (id, company_id, emitter_tax_id, product_code, commercial_unit, description,
         length_mm, width_mm, height_mm, gross_weight_grams, units_per_box,
         measured_at, measurement_source, measurement_margin_mm)
      values
        (${typedBoxId}, ${companyId}, ${EMITTER}, ${typedBox.productCode}, ${typedBox.commercialUnit},
         'SAB FARNESE 180G PURO E HIDRATAN', ${typedBox.lengthMm}, ${typedBox.widthMm},
         ${typedBox.heightMm}, ${typedBox.grossWeightGrams}, ${typedBox.unitsPerBox},
         ${typedBox.measuredAt}, ${typedBox.measurementSource}, ${typedBox.measurementMarginMm}),
        (${replicatedBoxId}, ${companyId}, ${EMITTER}, ${replicatedBox.productCode},
         ${replicatedBox.commercialUnit}, 'SAB FARNESE 180G AVEIA ESFOLIANT', ${replicatedBox.lengthMm},
         ${replicatedBox.widthMm}, ${replicatedBox.heightMm}, ${replicatedBox.grossWeightGrams},
         ${replicatedBox.unitsPerBox}, ${replicatedBox.measuredAt}, ${replicatedBox.measurementSource},
         ${replicatedBox.measurementMarginMm})
    `)
  })

  afterAll(async () => {
    await db.delete(nfePackageBoxes).where(eq(nfePackageBoxes.companyId, companyId))
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  it('o consumer da importação (writePackageBoxes) só preenche carton_gtin nulo', async () => {
    const before = await readMeasuredColumns(typedBoxId)
    expect(before.cartonGtin).toBeNull()

    await db.transaction(async (tx) =>
      writePackageBoxes({
        boxes: [
          {
            cartonGtin: '7897751900238',
            commercialUnit: typedBox.commercialUnit,
            description: 'SAB FARNESE 180G PURO E HIDRATAN',
            emitterTaxId: EMITTER,
            productCode: typedBox.productCode,
          },
        ],
        companyId,
        grossWeightGrams: null,
        tx,
      }),
    )

    const after = await readMeasuredColumns(typedBoxId)
    expect(after).toEqual({ ...before, cartonGtin: '7897751900238' })
  })

  it('o backfill de caixas (insertPackageBoxes, onConflictDoNothing) não toca linha existente', async () => {
    const before = await readMeasuredColumns(typedBoxId)
    const backfillRepository = new DrizzleNfePackageBoxBackfillRepository(db)
    const inserted = await backfillRepository.insertPackageBoxes({
      boxes: [
        {
          cartonGtin: '9999999999999',
          commercialUnit: typedBox.commercialUnit,
          description: 'DESCRIÇÃO DIFERENTE QUE NUNCA DEVERIA ENTRAR',
          emitterTaxId: EMITTER,
          productCode: typedBox.productCode,
        },
      ],
      companyId,
    })

    // onConflictDoNothing: a linha já existe pela identidade (empresa, emitente, cProd, uCom).
    expect(inserted).toBe(0)
    expect(await readMeasuredColumns(typedBoxId)).toEqual(before)
  })

  it('o backfill de GTIN (fillCartonGtin) preenche só o nulo, sem tocar medida — inclusive replicated', async () => {
    const before = await readMeasuredColumns(replicatedBoxId)
    expect(before.cartonGtin).toBeNull()
    expect(before.measurementSource).toBe('replicated')
    expect(before.measurementMarginMm).toBeNull()

    const gtinRepository = new DrizzleNfePackageBoxGtinBackfillRepository(db)
    const filled = await gtinRepository.fillCartonGtin({
      boxIds: [replicatedBoxId],
      cartonGtin: '7897751900214',
      companyId,
    })
    expect(filled).toBe(1)

    const after = await readMeasuredColumns(replicatedBoxId)
    expect(after).toEqual({ ...before, cartonGtin: '7897751900214' })

    // Rodar de nov o é no-op: `carton_gtin` já não é nulo.
    const filledAgain = await gtinRepository.fillCartonGtin({
      boxIds: [replicatedBoxId],
      cartonGtin: '0000000000000',
      companyId,
    })
    expect(filledAgain).toBe(0)
    expect(await readMeasuredColumns(replicatedBoxId)).toEqual(after)
  })
})
