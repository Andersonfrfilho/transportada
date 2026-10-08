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
  nfeAddresses,
  nfeDocuments,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  storedObjects,
} from '../src/database/nfe.schema.js'
import { DrizzleNfeImportConsumerRepository } from '../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const COMPANY_CNPJ = '45678901000112'
const EMITTER_CNPJ = '30290856000160'
const SOURCE_SHA256 = 'b'.repeat(64)
const VALID_EMAIL = 'compras@cliente.example'
const INVALID_EMAIL = 'nao-e-um-email'

type RecipientCase = { readonly accessKey: string; readonly email: string | undefined }

const WITH_EMAIL: RecipientCase = {
  accessKey: '35190730290856000160550010000000511000000510',
  email: ` ${VALID_EMAIL} `,
}
const WITH_INVALID_EMAIL: RecipientCase = {
  accessKey: '35190730290856000160550010000000521000000520',
  email: INVALID_EMAIL,
}
const WITHOUT_EMAIL: RecipientCase = {
  accessKey: '35190730290856000160550010000000531000000530',
  email: undefined,
}

function importedXml(input: RecipientCase): ImportedNfeXml {
  return {
    chaveNfe: input.accessKey,
    document: {
      accessKey: input.accessKey,
      issuedAt: '2026-07-22T22:00:00.000Z',
      issuer: { name: 'Emitente', taxId: EMITTER_CNPJ },
      model: '55',
      number: '1',
      operationNature: 'Venda',
      operationType: '0',
      products: [],
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      recipient: {
        name: 'Destinatario',
        taxId: COMPANY_CNPJ,
        ...(input.email === undefined ? {} : { email: input.email }),
      },
      relatedCnpjs: [COMPANY_CNPJ],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: EMITTER_CNPJ,
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

describeDatabase('o e-mail do destinatário na importação (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const warnings: { message: string; metadata: unknown }[] = []
  const repository = new DrizzleNfeImportConsumerRepository(db, {
    logger: {
      info: () => undefined,
      warn: (message, metadata) => warnings.push({ message, metadata }),
    },
    storageProvider: 'minio',
  })

  async function importDocument(input: RecipientCase, ordinal: bigint): Promise<void> {
    const itemId = crypto.randomUUID()
    const sourceObjectId = crypto.randomUUID()
    await db.insert(storedObjects).values({
      bucket: 'transportada-private',
      companyId,
      id: sourceObjectId,
      mimeType: 'application/xml',
      objectKey: `staging/recipient-email-${ordinal}.xml`,
      provider: 'minio',
      purpose: 'import_source',
      sha256: SOURCE_SHA256,
      sizeBytes: 128n,
      status: 'staging',
    })
    await db.insert(nfeImportItems).values({
      companyId,
      id: itemId,
      importId,
      ordinal,
      sourceEntry: `recipient-email-${ordinal}.xml`,
      sourceName: `recipient-email-${ordinal}.xml`,
      sourceObjectId,
      sourceSha256: SOURCE_SHA256,
      status: 'pending',
    })
    await repository.completeItem({
      accessKey: input.accessKey,
      finalObject: {
        bucket: 'transportada-private',
        key: `tenants/${companyId}/nfe-documents/${input.accessKey}/original.xml`,
        objectId: crypto.randomUUID(),
        sha256: SOURCE_SHA256,
        sizeBytes: 128,
      },
      itemId,
      normalizedXml: importedXml(input),
      status: 'imported',
      variant: 'complete',
    })
  }

  async function readRecipientEmail(accessKey: string): Promise<string | null | undefined> {
    const [document] = await db
      .select({ recipientEmail: nfeDocuments.recipientEmail })
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, accessKey)))
    return document?.recipientEmail
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
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
      correlationId: 'recipient-email-correlation',
      id: importId,
      idempotencyKey: `idem-${importId}`,
      receivedCount: 3n,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: userId,
      source: 'upload',
      status: 'processing',
    })
    await importDocument(WITH_EMAIL, 1n)
    await importDocument(WITH_INVALID_EMAIL, 2n)
    await importDocument(WITHOUT_EMAIL, 3n)
  })

  afterAll(async () => {
    await db.delete(deliveryClients).where(eq(deliveryClients.companyId, companyId))
    await db.delete(contractors).where(eq(contractors.companyId, companyId))
    await db.delete(nfeAddresses).where(eq(nfeAddresses.companyId, companyId))
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

  it('grava o e-mail do <dest> aparado', async () => {
    expect(await readRecipientEmail(WITH_EMAIL.accessKey)).toBe(VALID_EMAIL)
  })

  it('grava nulo quando o e-mail é inválido, e a nota entra do mesmo jeito', async () => {
    expect(await readRecipientEmail(WITH_INVALID_EMAIL.accessKey)).toBeNull()
  })

  it('grava nulo quando a nota não traz e-mail', async () => {
    expect(await readRecipientEmail(WITHOUT_EMAIL.accessKey)).toBeNull()
  })

  it('conta a rejeição no log e nunca registra o endereço', () => {
    const rejections = warnings.filter((entry) => entry.message === 'nfe_recipient_email_rejected')

    expect(rejections).toHaveLength(1)
    expect(rejections[0]?.metadata).toEqual({ companyId, rejectedRecipientEmailCount: 1 })
    expect(JSON.stringify(warnings)).not.toContain(INVALID_EMAIL)
    expect(JSON.stringify(warnings)).not.toContain(VALID_EMAIL)
  })
})
