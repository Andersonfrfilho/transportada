/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  nfeDocuments,
  nfeImports,
  nfePackageBoxes,
  nfeProducts,
  storedObjects,
} from '../src/database/nfe.schema.js'
import { createNfePackageBoxGtinBackfill } from '../src/nfe-imports/application/nfe-package-box-gtin-backfill.service.js'
import { writePackageBoxes } from '../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import { DrizzleNfePackageBoxGtinBackfillRepository } from '../src/nfe-imports/infrastructure/drizzle-nfe-package-box-gtin-backfill.repository.js'
import { createNfeXmlImporter } from '../src/nfe-imports/infrastructure/nfe-xml-importer.gateway.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const EMITTER = '05868574001090'
/** GTIN-13 com dígito correto, outro GTIN-13 válido, e o primeiro com o dígito trocado. */
const GTIN_13 = '7894900011517'
const OTHER_GTIN = '7891000100103'
const WRONG_DIGIT = '7894900011518'

type Product = { code: string; commercialUnit: string; gtin?: string }

function buildImported(products: readonly Product[]): ImportedNfeXml {
  return {
    document: {
      issuer: { taxId: EMITTER },
      products: products.map((product) => ({ ...product, description: 'ENERG' })),
      volumes: [],
    },
    kind: 'authorized-nfe',
  } as unknown as ImportedNfeXml
}

describeDatabase('o GTIN das caixas existentes, preenchido do XML guardado (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const xmlByKey = new Map<string, string>()
  const importedByXml = new Map<string, ImportedNfeXml>()
  const boxIds = {
    filled: crypto.randomUUID(),
    invalid: crypto.randomUUID(),
    otherCompany: crypto.randomUUID(),
    preset: crypto.randomUUID(),
    withoutGtin: crypto.randomUUID(),
  }

  const backfill = createNfePackageBoxGtinBackfill({
    importer: createNfeXmlImporter({
      importXml: (xml) => {
        const imported = importedByXml.get(xml)
        if (imported === undefined) throw new Error('invalid_xml')
        return imported
      },
    }),
    repository: new DrizzleNfePackageBoxGtinBackfillRepository(db),
    storage: {
      readXml: async ({ key }) => {
        const xml = xmlByKey.get(key)
        if (xml === undefined) throw new Error('object_not_found')
        return xml
      },
    },
  })

  async function seedDocument(input: {
    readonly companyId: string
    readonly importId: string
    readonly products: readonly Product[]
    readonly stored: boolean
  }): Promise<void> {
    const objectId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const objectKey = `tenants/${input.companyId}/nfe-documents/${documentId}/original.xml`
    await db.insert(storedObjects).values({
      bucket: 'transportada-private',
      companyId: input.companyId,
      id: objectId,
      mimeType: 'application/xml',
      objectKey,
      provider: 'minio',
      purpose: 'nfe_document',
      sha256: 'b'.repeat(64),
      sizeBytes: 128n,
      status: 'final',
    })
    await db.insert(nfeDocuments).values({
      accessKey: `35190730290856000160550010${String(Math.floor(Math.random() * 1e17)).padStart(18, '0')}`,
      authorizationProtocol: '135260000000001',
      companyId: input.companyId,
      createdByUserId: userId,
      id: documentId,
      importId: input.importId,
      issuedAt: new Date('2026-07-22T22:00:00.000Z'),
      model: '55',
      number: '1',
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '10.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '10.0000',
      xmlObjectId: objectId,
      xmlSha256: 'b'.repeat(64),
    })
    await db.insert(nfeProducts).values(
      input.products.map((product, index) => ({
        cfop: '5102',
        code: product.code,
        commercialUnit: product.commercialUnit,
        companyId: input.companyId,
        description: 'ENERG',
        documentId,
        ncm: '22021000',
        ordinal: BigInt(index + 1),
        quantity: '1.0000',
        totalValue: '10.0000',
        unitValue: '10.0000',
      })),
    )
    if (!input.stored) return
    const xml = `<nfe id="${documentId}"/>`
    xmlByKey.set(objectKey, xml)
    importedByXml.set(xml, buildImported(input.products))
  }

  async function seedCompany(companyId: string): Promise<string> {
    const importId = crypto.randomUUID()
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
    await db.insert(nfeImports).values({
      companyId,
      correlationId: 'gtin-backfill',
      id: importId,
      idempotencyKey: `idem-${importId}`,
      receivedCount: 1n,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: userId,
      source: 'upload',
      status: 'completed',
    })
    return importId
  }

  async function readGtins(): Promise<Record<string, string | null>> {
    const rows = await db
      .select({ cartonGtin: nfePackageBoxes.cartonGtin, id: nfePackageBoxes.id })
      .from(nfePackageBoxes)
      .where(inArray(nfePackageBoxes.id, Object.values(boxIds)))
    const byId = new Map(rows.map((row) => [row.id, row.cartonGtin]))
    return Object.fromEntries(
      Object.entries(boxIds).map(([name, id]) => [name, byId.get(id) ?? null]),
    )
  }

  beforeAll(async () => {
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    const importA = await seedCompany(companyA)
    const importB = await seedCompany(companyB)

    const box = (id: string, companyId: string, productCode: string, cartonGtin?: string) => ({
      commercialUnit: 'CX24',
      companyId,
      emitterTaxId: EMITTER,
      id,
      productCode,
      ...(cartonGtin === undefined ? {} : { cartonGtin }),
    })
    await db
      .insert(nfePackageBoxes)
      .values([
        box(boxIds.filled, companyA, 'P1'),
        box(boxIds.preset, companyA, 'P2', OTHER_GTIN),
        box(boxIds.withoutGtin, companyA, 'P3'),
        box(boxIds.invalid, companyA, 'P4'),
        box(boxIds.otherCompany, companyB, 'P1'),
      ])

    await seedDocument({
      companyId: companyA,
      importId: importA,
      products: [
        { code: 'P1', commercialUnit: 'CX24', gtin: GTIN_13 },
        { code: 'P2', commercialUnit: 'CX24', gtin: GTIN_13 },
        { code: 'P3', commercialUnit: 'CX24' },
        { code: 'P4', commercialUnit: 'CX24', gtin: WRONG_DIGIT },
      ],
      stored: true,
    })
    /** A nota cujo objeto sumiu do bucket: conta como XML ausente, e o lote segue. */
    await seedDocument({
      companyId: companyA,
      importId: importA,
      products: [{ code: 'P3', commercialUnit: 'CX24' }],
      stored: false,
    })
    await seedDocument({
      companyId: companyB,
      importId: importB,
      products: [{ code: 'P1', commercialUnit: 'CX24', gtin: GTIN_13 }],
      stored: true,
    })
  })

  afterAll(async () => {
    for (const companyId of [companyA, companyB]) {
      await db.delete(nfePackageBoxes).where(eq(nfePackageBoxes.companyId, companyId))
      await db.delete(nfeProducts).where(eq(nfeProducts.companyId, companyId))
      await db.delete(nfeDocuments).where(eq(nfeDocuments.companyId, companyId))
      await db.delete(nfeImports).where(eq(nfeImports.companyId, companyId))
      await db.delete(storedObjects).where(eq(storedObjects.companyId, companyId))
      await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await provider.close()
  })

  const REPORT = {
    boxesFilled: 1,
    boxesInvalidGtin: 1,
    boxesWithoutGtin: 1,
    companies: 1,
    documentsRead: 1,
    documentsXmlMissing: 1,
    documentsXmlUnreadable: 0,
  }

  it('--dry-run conta o que gravaria e não grava nada', async () => {
    const result = await backfill.execute({ companyIds: [companyA], dryRun: true })

    expect(result).toEqual({ ...REPORT, dryRun: true })
    expect(await readGtins()).toEqual({
      filled: null,
      invalid: null,
      otherCompany: null,
      preset: OTHER_GTIN,
      withoutGtin: null,
    })
  })

  it('--confirm preenche só a caixa com GTIN válido, sem trocar o já gravado nem tocar outra empresa', async () => {
    const result = await backfill.execute({ companyIds: [companyA], dryRun: false })

    expect(result).toEqual({ ...REPORT, dryRun: false })
    expect(await readGtins()).toEqual({
      filled: GTIN_13,
      invalid: null,
      otherCompany: null,
      preset: OTHER_GTIN,
      withoutGtin: null,
    })
  })

  it('rodar de novo é no-op', async () => {
    const result = await backfill.execute({ companyIds: [companyA], dryRun: false })

    expect(result.boxesFilled).toBe(0)
    expect((await readGtins()).filled).toBe(GTIN_13)
  })

  it('a importação preenche o GTIN nulo e nunca troca o gravado nem a medição', async () => {
    const measuredId = crypto.randomUUID()
    await db.insert(nfePackageBoxes).values({
      commercialUnit: 'CX12',
      companyId: companyB,
      emitterTaxId: EMITTER,
      heightMm: 100,
      id: measuredId,
      lengthMm: 300,
      measuredAt: new Date(),
      productCode: 'P9',
      widthMm: 200,
    })

    await db.transaction(async (tx) =>
      writePackageBoxes({
        boxes: [
          {
            cartonGtin: GTIN_13,
            commercialUnit: 'CX12',
            description: 'ENERG',
            emitterTaxId: EMITTER,
            productCode: 'P9',
          },
          {
            cartonGtin: GTIN_13,
            commercialUnit: 'CX24',
            description: 'ENERG',
            emitterTaxId: EMITTER,
            productCode: 'P1',
          },
          {
            cartonGtin: GTIN_13,
            commercialUnit: 'UN',
            description: 'ENERG',
            emitterTaxId: EMITTER,
            productCode: 'P10',
          },
        ],
        companyId: companyB,
        grossWeightGrams: null,
        tx,
      }),
    )
    await db.transaction(async (tx) =>
      writePackageBoxes({
        boxes: [
          {
            cartonGtin: OTHER_GTIN,
            commercialUnit: 'CX12',
            description: 'ENERG',
            emitterTaxId: EMITTER,
            productCode: 'P9',
          },
          { commercialUnit: 'UN', description: 'ENERG', emitterTaxId: EMITTER, productCode: 'P10' },
        ],
        companyId: companyB,
        grossWeightGrams: null,
        tx,
      }),
    )

    const rows = await db
      .select()
      .from(nfePackageBoxes)
      .where(and(eq(nfePackageBoxes.companyId, companyB)))
    const byCode = new Map(rows.map((row) => [row.productCode, row]))
    expect(byCode.get('P9')).toMatchObject({ cartonGtin: GTIN_13, lengthMm: 300, widthMm: 200 })
    expect(byCode.get('P1')?.cartonGtin).toBe(GTIN_13)
    expect(byCode.get('P10')?.cartonGtin).toBe(GTIN_13)
    const [companyABox] = await db
      .select({ cartonGtin: nfePackageBoxes.cartonGtin })
      .from(nfePackageBoxes)
      .where(eq(nfePackageBoxes.id, boxIds.invalid))
    expect(companyABox?.cartonGtin).toBeNull()
  })
})
