/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { and, eq, sql } from 'drizzle-orm'

import { contractors, deliveryClients } from '../src/database/delivery-client.schema.js'
import {
  companyFiscalProfiles,
  nfeDocuments,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  storedObjects,
} from '../src/database/nfe.schema.js'
import { DrizzleNfeImportConsumerRepository } from '../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const COMPANY_CNPJ = '12345678000190'
const ACCESS_KEY = '35190730290856000160550010000000011000000010'
const SOURCE_KEY = 'staging/authorized.xml'
const SOURCE_SHA256 = 'a'.repeat(64)
const SECOND_ACCESS_KEY = '35190730290856000160550010000000021000000010'

function authorizedImportedXml(
  overrides: { accessKey?: string; number?: string; recipientName?: string } = {},
): ImportedNfeXml {
  const accessKey = overrides.accessKey ?? ACCESS_KEY
  return {
    chaveNfe: accessKey,
    document: {
      accessKey,
      additionalInformation: 'Contrato sintético',
      issuedAt: '2026-07-22T22:00:00.000Z',
      issuer: { name: 'Emitente', taxId: '30290856000160' },
      model: '55',
      number: overrides.number ?? '1',
      operationNature: 'Prestacao',
      operationType: '0',
      products: [],
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      recipient: { name: overrides.recipientName ?? 'Destinatario', taxId: COMPANY_CNPJ },
      relatedCnpjs: [COMPANY_CNPJ],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: '30290856000160',
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '',
    schema: 'xml-import',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
    xmlDecoded: '<xml>authorized</xml>',
  } satisfies ImportedNfeXml
}

describeDatabase('DrizzleNfeImportConsumerRepository (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const sourceObjectId = crypto.randomUUID()
  const finalObjectId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const repository = new DrizzleNfeImportConsumerRepository(db, { storageProvider: 'minio' })

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
    await db.insert(storedObjects).values({
      bucket: 'transportada-private',
      companyId,
      id: sourceObjectId,
      mimeType: 'application/xml',
      objectKey: SOURCE_KEY,
      provider: 'minio',
      purpose: 'import_source',
      sha256: SOURCE_SHA256,
      sizeBytes: 128n,
      status: 'staging',
    })
    await db.insert(nfeImports).values({
      companyId,
      correlationId: 'integration-correlation',
      id: importId,
      idempotencyKey: `idem-${importId}`,
      receivedCount: 1n,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: userId,
      source: 'upload',
      status: 'processing',
    })
    await db.insert(nfeImportItems).values({
      companyId,
      id: itemId,
      importId,
      ordinal: 1n,
      sourceEntry: 'authorized.xml',
      sourceName: 'authorized.xml',
      sourceObjectId,
      sourceSha256: SOURCE_SHA256,
      status: 'pending',
    })
  })

  afterAll(async () => {
    await db.delete(deliveryClients).where(eq(deliveryClients.companyId, companyId))
    await db.delete(contractors).where(eq(contractors.companyId, companyId))
    await db.delete(nfeParticipants).where(eq(nfeParticipants.companyId, companyId))
    await db.delete(nfeDocuments).where(eq(nfeDocuments.companyId, companyId))
    await db.delete(nfeImportItems).where(eq(nfeImportItems.companyId, companyId))
    await db.delete(nfeImports).where(eq(nfeImports.companyId, companyId))
    await db.delete(storedObjects).where(eq(storedObjects.companyId, companyId))
    await db.delete(companyFiscalProfiles).where(eq(companyFiscalProfiles.companyId, companyId))
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  it('getPendingImport returns the tenant-scoped aggregate with source objects', async () => {
    const pendingImport = await repository.getPendingImport({ companyId, importId })

    expect(pendingImport).toEqual({
      companyCnpj: COMPANY_CNPJ,
      companyId,
      id: importId,
      items: [
        {
          attempt: 1,
          id: itemId,
          importId,
          ordinal: 1,
          sourceContentType: 'application/xml',
          sourceEntry: 'authorized.xml',
          sourceKey: SOURCE_KEY,
          sourceName: 'authorized.xml',
          sourceSha256: SOURCE_SHA256,
        },
      ],
    })
  })

  it('getPendingImport is isolated by tenant', async () => {
    const pendingImport = await repository.getPendingImport({
      companyId: crypto.randomUUID(),
      importId,
    })

    expect(pendingImport).toBeNull()
  })

  it('findExistingDocument returns null before the document is written', async () => {
    const existing = await repository.findExistingDocument({ accessKey: ACCESS_KEY, companyId })

    expect(existing).toBeNull()
  })

  it('completeItem persists the document with its children and marks the item imported', async () => {
    await repository.completeItem({
      accessKey: ACCESS_KEY,
      finalObject: {
        bucket: 'transportada-private',
        key: `tenants/${companyId}/nfe-documents/${ACCESS_KEY}/original.xml`,
        objectId: finalObjectId,
        sha256: SOURCE_SHA256,
        sizeBytes: 128,
      },
      itemId,
      normalizedXml: authorizedImportedXml(),
      status: 'imported',
      variant: 'complete',
    })

    const [document] = await db
      .select()
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, ACCESS_KEY)))

    expect(document).toBeDefined()

    const [finalObject] = await db
      .select()
      .from(storedObjects)
      .where(eq(storedObjects.id, finalObjectId))
    expect(finalObject).toBeDefined()
    expect(finalObject?.purpose).toBe('nfe_document')
    expect(finalObject?.status).toBe('final')
    expect(finalObject?.companyId).toBe(companyId)
    expect(finalObject?.objectKey).toBe(
      `tenants/${companyId}/nfe-documents/${ACCESS_KEY}/original.xml`,
    )
    expect(finalObject?.sizeBytes).toBe(128n)

    expect(document?.status).toBe('authorized')
    expect(document?.model).toBe('55')
    expect(document?.number).toBe('1')
    expect(document?.series).toBe('1')
    expect(document?.totalValue).toBe('10.0000')
    expect(document?.productsValue).toBe('10.0000')
    expect(document?.authorizationProtocol).toBe('135260000000001')
    expect(document?.xmlObjectId).toBe(finalObjectId)
    expect(document?.importId).toBe(importId)
    expect(document?.createdByUserId).toBe(userId)

    const participants = await db
      .select()
      .from(nfeParticipants)
      .where(eq(nfeParticipants.documentId, document!.id))
    const roles = participants.map((participant) => participant.role).sort()

    expect(roles).toEqual(['emitter', 'recipient'])

    const existing = await repository.findExistingDocument({ accessKey: ACCESS_KEY, companyId })
    expect(existing).toEqual({ documentId: document!.id })

    const [item] = await db.select().from(nfeImportItems).where(eq(nfeImportItems.id, itemId))
    expect(item?.status).toBe('imported')
    expect(item?.accessKey).toBe(ACCESS_KEY)
  })

  /**
   * Spec 060 T006 / ADR-0048 §1: a mesma importação que gravou a nota **cria o cadastro**, sozinha.
   * O destinatário vira cliente de entrega e o emitente vira contratante — com identidade e nada
   * além dela.
   */
  it('creates the delivery client and the contractor out of the imported note', async () => {
    const [client] = await db
      .select()
      .from(deliveryClients)
      .where(and(eq(deliveryClients.companyId, companyId), eq(deliveryClients.taxId, COMPANY_CNPJ)))
    const [contractor] = await db
      .select()
      .from(contractors)
      .where(and(eq(contractors.companyId, companyId), eq(contractors.taxId, '30290856000160')))

    expect(client?.displayName).toBe('Destinatario')
    expect(contractor?.displayName).toBe('Emitente')
  })

  /**
   * A segunda nota do mesmo CNPJ **não** duplica cadastro e **não** toca em regra: atualiza o nome
   * visto e nada mais. É a idempotência por `(company_id, tax_id)`, e é o que faz a base ficar
   * completa ao fim de um mês sem ninguém digitar.
   */
  it('is idempotent, updates only the seen name, and never touches the rules', async () => {
    /**
     * A regra é escrita por SQL cru de propósito: o **worker não conhece estas colunas**. A cópia
     * dele tem só identidade, e é isso que garante que a criação automática não tem como tocá-las.
     */
    await db.execute(
      sql`update delivery_clients set delivery_fee_amount = '45.0000', requires_scheduling = true
          where company_id = ${companyId} and tax_id = ${COMPANY_CNPJ}`,
    )

    const secondItemId = crypto.randomUUID()
    const secondObjectId = crypto.randomUUID()
    await db.insert(storedObjects).values({
      bucket: 'transportada-private',
      companyId,
      id: secondObjectId,
      mimeType: 'application/xml',
      objectKey: `${SOURCE_KEY}.2`,
      provider: 'minio',
      purpose: 'import_source',
      sha256: SOURCE_SHA256,
      sizeBytes: 128n,
      status: 'staging',
    })
    await db.insert(nfeImportItems).values({
      companyId,
      id: secondItemId,
      importId,
      ordinal: 2n,
      sourceEntry: 'authorized-2.xml',
      sourceName: 'authorized-2.xml',
      sourceObjectId: secondObjectId,
      sourceSha256: SOURCE_SHA256,
      status: 'pending',
    })

    await repository.completeItem({
      accessKey: SECOND_ACCESS_KEY,
      finalObject: {
        bucket: 'transportada-private',
        key: `tenants/${companyId}/nfe-documents/${SECOND_ACCESS_KEY}/original.xml`,
        objectId: crypto.randomUUID(),
        sha256: SOURCE_SHA256,
        sizeBytes: 128,
      },
      itemId: secondItemId,
      normalizedXml: authorizedImportedXml({
        accessKey: SECOND_ACCESS_KEY,
        number: '2',
        recipientName: 'Destinatario Renomeado',
      }),
      status: 'imported',
      variant: 'complete',
    })

    const rows = (await db.execute(
      sql`select display_name, requires_scheduling, delivery_fee_amount from delivery_clients
          where company_id = ${companyId} and tax_id = ${COMPANY_CNPJ}`,
    )) as unknown as ReadonlyArray<{
      readonly delivery_fee_amount: string
      readonly display_name: string
      readonly requires_scheduling: boolean
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0]?.display_name).toBe('Destinatario Renomeado')
    // O que gente preencheu continua de pé: a criação automática nunca sobrescreve regra.
    expect(rows[0]?.requires_scheduling).toBe(true)
    expect(rows[0]?.delivery_fee_amount).toBe('45.0000')
  })

  it('finalizeImport persists the counters and the partial status', async () => {
    const summary = {
      duplicatedCount: 1,
      failedCount: 0,
      id: importId,
      importedCount: 1,
      invalidCount: 1,
      processedCount: 4,
      receivedCount: 4,
      rejectedCount: 1,
      status: 'partially_processed' as const,
    }

    const result = await repository.finalizeImport({ importId, summary })

    expect(result).toEqual(summary)

    const [row] = await db.select().from(nfeImports).where(eq(nfeImports.id, importId))
    expect(row?.status).toBe('partially_processed')
    expect(row?.importedCount).toBe(1n)
    expect(row?.duplicatedCount).toBe(1n)
    expect(row?.invalidCount).toBe(1n)
    expect(row?.rejectedCount).toBe(1n)
    expect(row?.failedCount).toBe(0n)
    expect(row?.processedCount).toBe(4n)
  })
})
