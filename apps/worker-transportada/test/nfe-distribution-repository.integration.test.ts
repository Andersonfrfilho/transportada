/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  nfeDocuments,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  storedObjects,
} from '../src/database/nfe.schema.js'
import { DrizzleNfeDistributionRepository } from '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const ENVIRONMENT = 'homologation' as const
const COMPANY_CNPJ = '12345678000190'
const DOCUMENT_ACCESS_KEY = '35190730290856000160550010000000011000000010'
const EVENT_TARGET_KEY = '35190730290856000160550010000000021000000029'
const SUMMARY_ACCESS_KEY = '35190730290856000160550010000000031000000038'
const SHA256 = 'a'.repeat(64)

function authorizedItem(): ImportedNfeXml {
  return {
    chaveNfe: DOCUMENT_ACCESS_KEY,
    document: {
      accessKey: DOCUMENT_ACCESS_KEY,
      additionalInformation: 'Distribuicao DF-e',
      issuedAt: '2026-07-22T22:00:00.000Z',
      issuer: { name: 'Emitente', taxId: '30290856000160' },
      model: '55',
      number: '1',
      operationNature: 'Venda',
      operationType: '1',
      products: [],
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      recipient: { name: 'Destinatario', taxId: COMPANY_CNPJ },
      relatedCnpjs: [COMPANY_CNPJ],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: '30290856000160',
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '000000000000051',
    schema: 'procNFe',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
  } satisfies ImportedNfeXml
}

function eventItem(): ImportedNfeXml {
  return {
    chaveNfe: EVENT_TARGET_KEY,
    emitenteCnpj: '30290856000160',
    event: {
      accessKey: EVENT_TARGET_KEY,
      occurredAt: '2026-07-22T23:00:00.000Z',
      sequence: '1',
      type: '110111',
    },
    kind: 'nfe-event',
    mod: '55',
    nsu: '000000000000052',
    schema: 'procEventoNFe',
    situacao: '1',
    valorTotal: 0,
    xmlComprimido: '',
  } satisfies ImportedNfeXml
}

type DistributionPersistItem = Parameters<
  DrizzleNfeDistributionRepository['persistPage']
>[0]['items'][number]

function finalObject(objectId: string, accessKey: string, companyId: string) {
  return {
    bucket: 'transportada-private',
    key: `tenants/${companyId}/nfe-documents/${accessKey}/original.xml`,
    objectId,
    sha256: SHA256,
    sizeBytes: 256,
  }
}

describeDatabase('DrizzleNfeDistributionRepository.persistPage (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const repository = new DrizzleNfeDistributionRepository(db, { storageProvider: 'minio' })

  const page: readonly DistributionPersistItem[] = [
    {
      finalObject: finalObject(crypto.randomUUID(), DOCUMENT_ACCESS_KEY, companyId),
      normalizedXml: authorizedItem(),
      nsu: '000000000000051',
      variant: 'complete',
    },
    {
      finalObject: finalObject(crypto.randomUUID(), EVENT_TARGET_KEY, companyId),
      normalizedXml: eventItem(),
      nsu: '000000000000052',
      variant: 'event',
    },
    {
      finalObject: finalObject(crypto.randomUUID(), SUMMARY_ACCESS_KEY, companyId),
      nsu: '000000000000053',
      summary: {
        accessKey: SUMMARY_ACCESS_KEY,
        emitterCnpj: '30290856000160',
        issuedAt: '2026-07-22T21:00:00.000Z',
        situacao: '1',
        totalValue: '25.0000',
      },
      variant: 'summary',
    },
    /**
     * Resumo sem chave: `nfe_import_items_access_key_check` só aceita NULL ou 44 dígitos, então a
     * coluna precisa ficar vazia. Enquanto o adapter sintetizava `nsu-<nsu>` a página inteira caía.
     */
    {
      finalObject: finalObject(crypto.randomUUID(), 'nsu-000000000000054', companyId),
      nsu: '000000000000054',
      summary: {
        emitterCnpj: '30290856000160',
        situacao: '1',
      },
      variant: 'summary',
    },
  ]

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${membershipId}, ${userId}, ${companyId}, 'active')`,
    )
    await db.insert(companyFiscalProfiles).values({
      city: 'São Paulo',
      cityIbgeCode: '3550308',
      cnpj: COMPANY_CNPJ,
      companyId,
      complement: 'Sala 1',
      district: 'Centro',
      email: 'fiscal@example.com',
      legalName: 'Transportadora Exemplo LTDA',
      municipalRegistration: '000000',
      number: '100',
      phone: '11999999999',
      postalCode: '01001000',
      rntrc: '12345678',
      state: 'SP',
      stateRegistration: '110042490114',
      street: 'Praça da Sé',
      taxRegime: '1',
      tradeName: 'Exemplo',
    })
    await db.insert(nfeImports).values({
      companyId,
      correlationId: 'distribution-correlation',
      id: importId,
      idempotencyKey: `idem-${importId}`,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: userId,
      source: 'distribution',
      status: 'processing',
    })
  })

  afterAll(async () => {
    await db.delete(nfeParticipants).where(eq(nfeParticipants.companyId, companyId))
    await db.delete(nfeDocuments).where(eq(nfeDocuments.companyId, companyId))
    await db.delete(nfeEvents).where(eq(nfeEvents.companyId, companyId))
    await db.delete(nfeImportItems).where(eq(nfeImportItems.companyId, companyId))
    await db.delete(nfeImports).where(eq(nfeImports.companyId, companyId))
    await db.delete(storedObjects).where(eq(storedObjects.companyId, companyId))
    await db.delete(companyFiscalProfiles).where(eq(companyFiscalProfiles.companyId, companyId))
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  it('persists documents, events and summaries with distribution provenance', async () => {
    const result = await repository.persistPage({
      companyId,
      environment: ENVIRONMENT,
      importId,
      items: page,
      maxNsu: '000000000000100',
      ultNsu: '000000000000054',
    })

    expect(result.documentCount).toBe(1)
    expect(result.eventCount).toBe(1)
    expect(result.summaryCount).toBe(2)
    expect(result.acceptedCount).toBe(4)
    expect(result.duplicatedCount).toBe(0)

    const [document] = await db
      .select()
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, DOCUMENT_ACCESS_KEY)),
      )
    expect(document).toBeDefined()
    expect(document?.source).toBe('distribution')
    expect(document?.importId).toBe(importId)
    expect(document?.createdByUserId).toBe(userId)
    expect(document?.totalValue).toBe('10.0000')

    const participants = await db
      .select()
      .from(nfeParticipants)
      .where(eq(nfeParticipants.documentId, document!.id))
    expect(participants.map((p) => p.role).sort()).toEqual(['emitter', 'recipient'])

    const [event] = await db
      .select()
      .from(nfeEvents)
      .where(
        and(eq(nfeEvents.companyId, companyId), eq(nfeEvents.targetAccessKey, EVENT_TARGET_KEY)),
      )
    expect(event).toBeDefined()
    expect(event?.eventType).toBe('110111')
    expect(event?.eventSequence).toBe(1n)
    expect(event?.sourceNsu).toBe('000000000000052')
    expect(event?.environment).toBe(ENVIRONMENT)

    const items = await db
      .select()
      .from(nfeImportItems)
      .where(eq(nfeImportItems.importId, importId))
      .orderBy(nfeImportItems.sourceNsu)
    expect(items).toHaveLength(4)
    expect(items.map((item) => item.variant)).toEqual(['complete', 'event', 'summary', 'summary'])
    expect(items.map((item) => item.sourceNsu)).toEqual([
      '000000000000051',
      '000000000000052',
      '000000000000053',
      '000000000000054',
    ])
    for (const item of items) {
      expect(item.environment).toBe(ENVIRONMENT)
      expect(item.status).toBe('imported')
    }

    const summaryItem = items.find((item) => item.sourceNsu === '000000000000053')
    expect(summaryItem?.accessKey).toBe(SUMMARY_ACCESS_KEY)

    const keylessSummary = items.find((item) => item.sourceNsu === '000000000000054')
    expect(keylessSummary?.variant).toBe('summary')
    expect(keylessSummary?.accessKey).toBeNull()

    const objects = await db
      .select()
      .from(storedObjects)
      .where(eq(storedObjects.companyId, companyId))
    expect(objects).toHaveLength(4)
    expect(objects.every((object) => object.status === 'final')).toBe(true)

    const [run] = await db.select().from(nfeImports).where(eq(nfeImports.id, importId))
    expect(run?.receivedCount).toBe(4n)
    expect(run?.processedCount).toBe(4n)
    expect(run?.importedCount).toBe(4n)
    expect(run?.duplicatedCount).toBe(0n)
  })

  it('absorbs a replayed page without duplicating documents, events or items', async () => {
    const result = await repository.persistPage({
      companyId,
      environment: ENVIRONMENT,
      importId,
      items: page,
      maxNsu: '000000000000100',
      ultNsu: '000000000000054',
    })

    expect(result.acceptedCount).toBe(0)
    expect(result.duplicatedCount).toBe(4)

    const documents = await db
      .select()
      .from(nfeDocuments)
      .where(eq(nfeDocuments.companyId, companyId))
    expect(documents).toHaveLength(1)

    const events = await db.select().from(nfeEvents).where(eq(nfeEvents.companyId, companyId))
    expect(events).toHaveLength(1)

    const items = await db
      .select()
      .from(nfeImportItems)
      .where(eq(nfeImportItems.importId, importId))
    expect(items).toHaveLength(4)
  })

  /**
   * O resumo e o evento entraram na mesma página do documento completo, e nenhum dos dois grava
   * linha em `nfe_documents` — a busca não pode confundi-los com nota que a empresa já tem.
   */
  it('answers only with access keys the company already has as a complete document', async () => {
    const stored = await repository.findStoredAccessKeys({
      accessKeys: [DOCUMENT_ACCESS_KEY, SUMMARY_ACCESS_KEY, EVENT_TARGET_KEY],
      companyId,
    })

    expect([...stored]).toEqual([DOCUMENT_ACCESS_KEY])
  })

  it('never answers with an access key from another tenant', async () => {
    const stored = await repository.findStoredAccessKeys({
      accessKeys: [DOCUMENT_ACCESS_KEY],
      companyId: crypto.randomUUID(),
    })

    expect(stored).toHaveLength(0)
  })

  it('keeps persisted distribution data isolated per tenant', async () => {
    const documents = await db
      .select()
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, crypto.randomUUID()),
          eq(nfeDocuments.accessKey, DOCUMENT_ACCESS_KEY),
        ),
      )
    expect(documents).toHaveLength(0)
  })
})
