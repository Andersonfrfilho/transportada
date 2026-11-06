/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { DfeItem, ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  nfeAccessKeyLookupBudgets,
  nfeAccessKeyLookups,
  nfeDocuments,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  storedObjects,
} from '../src/database/nfe.schema.js'
import { processedMessages, processingOutbox } from '../src/database/processing.schema.js'
import type { NfeAccessKeyEnvelopeV1 } from '../src/messaging/nfe-access-key-envelope.schema.js'
import { createProcessAccessKeyLookupUseCase } from '../src/nfe-access-key-lookup/application/process-access-key-lookup.use-case.js'
import type { AccessKeyLookupGatewayResult } from '../src/nfe-access-key-lookup/domain/nfe-access-key-lookup.types.js'
import { DrizzleAccessKeyLookupBudgetRepository } from '../src/nfe-access-key-lookup/infrastructure/drizzle-access-key-lookup-budget.repository.js'
import { DrizzleAccessKeyLookupRepository } from '../src/nfe-access-key-lookup/infrastructure/drizzle-access-key-lookup.repository.js'
import { DrizzleNfeDistributionRepository } from '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
import { PersistentProcessedMessageService } from '../src/outbox/application/persistent-processed-message.service.js'
import { DrizzleOutboxRepository } from '../src/outbox/infrastructure/drizzle-outbox.repository.js'
import { DISTRIBUTION_CONFIG } from './nfe-distribution/nfe-distribution.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const BUCKET = 'transportada-private'
const NOW = new Date('2026-11-06T12:00:00.000Z')
const keys = {
  distributionFirst: '35190730290856000160550010000000511000000518',
  lookupFirst: '35190730290856000160550010000000521000000527',
  outbox: '35190730290856000160550010000000531000000536',
  refused: '35190730290856000160550010000000541000000545',
  repositoryRace: '35190730290856000160550010000000551000000554',
} as const

function importedXml(accessKey: string): ImportedNfeXml {
  return {
    chaveNfe: accessKey,
    document: {
      accessKey,
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
      recipient: { name: 'Destinatario', taxId: '12345678000190' },
      relatedCnpjs: ['12345678000190'],
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

function procNfeItem(): DfeItem {
  return {
    nsu: '1',
    schema: 'procNFe',
    xmlComprimido: gzipSync(Buffer.from('<nfeProc/>')).toString('base64'),
    xmlDecoded: '<nfeProc/>',
  }
}

describeDatabase('access key lookup consumer (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const logger = { error: () => undefined, info: () => undefined, warn: () => undefined }
  const lookupRepository = new DrizzleAccessKeyLookupRepository(db, { logger })
  const distributionRepository = new DrizzleNfeDistributionRepository(db, { logger })
  const outboxRepository = new DrizzleOutboxRepository(db)
  const gatewayCalls: string[] = []
  let gatewayResult: AccessKeyLookupGatewayResult = { item: procNfeItem(), kind: 'document' }

  const useCase = createProcessAccessKeyLookupUseCase({
    budget: new DrizzleAccessKeyLookupBudgetRepository(db),
    clock: { now: () => NOW },
    gatewayFactory: {
      create: () => ({
        async consultarPorChave(input) {
          gatewayCalls.push(input.chaveNfe)
          return gatewayResult
        },
      }),
    },
    logger,
    processedMessages: new PersistentProcessedMessageService({ repository: outboxRepository }),
    profile: { loadConfig: async () => DISTRIBUTION_CONFIG },
    repository: lookupRepository,
    storage: {
      async storeDocument(input) {
        return {
          bucket: BUCKET,
          key: `tenants/${input.companyId}/nfe-documents/${input.accessKey}/original.xml`,
          objectId: crypto.randomUUID(),
          sha256: input.sourceSha256,
          sizeBytes: input.sourceBytes.byteLength,
        }
      },
    },
    xmlImporter: {
      async importXml() {
        return importedXml(currentAccessKey)
      },
    },
  })
  let currentAccessKey: string = keys.lookupFirst

  async function seedLookup(accessKey: string, options: { readonly isPublished?: boolean } = {}) {
    const importId = crypto.randomUUID()
    const lookupId = crypto.randomUUID()
    await db.insert(nfeImports).values({
      companyId,
      correlationId: `corr-${importId}`,
      id: importId,
      idempotencyKey: `idem-${importId}`,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: userId,
      source: 'access_key',
      status: 'queued',
    })
    await db.insert(nfeAccessKeyLookups).values({
      accessKey,
      companyId,
      correlationId: `corr-${lookupId}`,
      environment: 'homologation',
      id: lookupId,
      importId,
      requestedByUserId: userId,
      status: 'queued',
    })
    const eventId = crypto.randomUUID()
    await db.insert(processingOutbox).values({
      actorUserId: userId,
      aggregateId: importId,
      aggregateType: 'nfe_import',
      companyId,
      correlationId: `corr-${lookupId}`,
      eventId,
      eventType: 'transportada.nfe.access-key.requested',
      eventVersion: 1n,
      payload: { companyId, importId, lookupId },
      ...(options.isPublished === false ? {} : { publishedAt: NOW }),
    })
    const envelope: NfeAccessKeyEnvelopeV1 = {
      actorId: userId,
      companyId,
      correlationId: `corr-${lookupId}`,
      eventId,
      occurredAt: NOW.toISOString(),
      payload: { importId, lookupId },
      type: 'transportada.nfe.access-key.requested',
      version: 1,
    }
    return { envelope, eventId, importId, lookupId }
  }

  async function readLookup(lookupId: string) {
    const [row] = await db
      .select()
      .from(nfeAccessKeyLookups)
      .where(eq(nfeAccessKeyLookups.id, lookupId))
    return row!
  }

  async function readImport(importId: string) {
    const [row] = await db.select().from(nfeImports).where(eq(nfeImports.id, importId))
    return row!
  }

  async function countDocuments(accessKey: string): Promise<number> {
    const rows = await db
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, accessKey)))
    return rows.length
  }

  async function distributionPersist(accessKey: string, importId: string, nsu: string) {
    const objectId = crypto.randomUUID()
    return distributionRepository.persistPage({
      companyId,
      environment: 'homologation',
      importId,
      items: [
        {
          finalObject: {
            bucket: BUCKET,
            key: `tenants/${companyId}/nfe-documents/${accessKey}/original.xml`,
            objectId,
            sha256: 'a'.repeat(64),
            sizeBytes: 10,
          },
          normalizedXml: importedXml(accessKey),
          nsu,
          variant: 'complete',
        },
      ],
      maxNsu: nsu,
      ultNsu: nsu,
    })
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
  })

  afterAll(async () => {
    await db.execute(sql`delete from delivery_clients where company_id = ${companyId}`)
    await db.execute(sql`delete from contractors where company_id = ${companyId}`)
    await db.delete(processedMessages).where(eq(processedMessages.companyId, companyId))
    await db.delete(processingOutbox).where(eq(processingOutbox.companyId, companyId))
    await db.delete(nfeAccessKeyLookups).where(eq(nfeAccessKeyLookups.companyId, companyId))
    await db
      .delete(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    await db.delete(nfeParticipants).where(eq(nfeParticipants.companyId, companyId))
    await db.delete(nfeDocuments).where(eq(nfeDocuments.companyId, companyId))
    await db.delete(nfeImportItems).where(eq(nfeImportItems.companyId, companyId))
    await db.delete(nfeImports).where(eq(nfeImports.companyId, companyId))
    await db.delete(storedObjects).where(eq(storedObjects.companyId, companyId))
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  it('imports procNFe as a document with children and source access_key, then distribution does not duplicate', async () => {
    currentAccessKey = keys.lookupFirst
    gatewayResult = { item: procNfeItem(), kind: 'document' }
    const { envelope, importId, lookupId } = await seedLookup(keys.lookupFirst)

    await useCase.execute(envelope)

    const [document] = await db
      .select()
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, keys.lookupFirst)),
      )
    expect(document?.source).toBe('access_key')
    expect(document?.importId).toBe(importId)
    expect(document?.createdByUserId).toBe(userId)
    expect(document?.xmlSha256).toMatch(/^[0-9a-f]{64}$/)
    const participants = await db
      .select()
      .from(nfeParticipants)
      .where(eq(nfeParticipants.documentId, document!.id))
    expect(participants.map((participant) => participant.role).sort()).toEqual([
      'emitter',
      'recipient',
    ])

    const lookup = await readLookup(lookupId)
    expect(lookup).toMatchObject({
      attempts: 1n,
      cStat: '138',
      documentId: document!.id,
      status: 'imported',
    })
    expect(lookup.finishedAt).not.toBeNull()
    const importRow = await readImport(importId)
    expect(importRow).toMatchObject({
      duplicatedCount: 0n,
      importedCount: 1n,
      processedCount: 1n,
      receivedCount: 1n,
      status: 'completed',
    })
    const items = await db
      .select()
      .from(nfeImportItems)
      .where(eq(nfeImportItems.importId, importId))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ status: 'imported', variant: 'complete' })

    const [budget] = await db
      .select()
      .from(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    expect(budget?.usedInWindow).toBe(1)

    const distributionImportId = crypto.randomUUID()
    await db.insert(nfeImports).values({
      companyId,
      correlationId: 'distribution-correlation',
      id: distributionImportId,
      idempotencyKey: `idem-${distributionImportId}`,
      requestFingerprint: `fingerprint-${distributionImportId}`,
      requestedByUserId: userId,
      source: 'distribution',
      status: 'processing',
    })
    const result = await distributionPersist(
      keys.lookupFirst,
      distributionImportId,
      '000000000000061',
    )

    expect(result.documentCount).toBe(0)
    expect(await countDocuments(keys.lookupFirst)).toBe(1)
  })

  it('reuses the document when distribution got it first, without SEFAZ or budget', async () => {
    currentAccessKey = keys.distributionFirst
    const { envelope, importId, lookupId } = await seedLookup(keys.distributionFirst)
    const callsBefore = gatewayCalls.length
    const [budgetBefore] = await db
      .select()
      .from(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    await distributionPersist(keys.distributionFirst, importId, '000000000000071')
    await db
      .update(nfeImports)
      .set({ importedCount: 0n, duplicatedCount: 0n, processedCount: 0n, receivedCount: 0n })
      .where(eq(nfeImports.id, importId))

    await useCase.execute(envelope)

    const [document] = await db
      .select()
      .from(nfeDocuments)
      .where(eq(nfeDocuments.accessKey, keys.distributionFirst))
    expect(document?.source).toBe('distribution')
    const lookup = await readLookup(lookupId)
    expect(lookup).toMatchObject({ documentId: document!.id, status: 'imported' })
    expect(lookup.finishedAt).not.toBeNull()
    expect(await readImport(importId)).toMatchObject({
      duplicatedCount: 1n,
      importedCount: 0n,
      processedCount: 1n,
      receivedCount: 1n,
      status: 'completed',
    })
    expect(gatewayCalls.length).toBe(callsBefore)
    const [budgetAfter] = await db
      .select()
      .from(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    expect(budgetAfter?.usedInWindow).toBe(budgetBefore?.usedInWindow)
  })

  it('treats a document written between the check and the write as a duplicate', async () => {
    currentAccessKey = keys.repositoryRace
    const { importId, lookupId } = await seedLookup(keys.repositoryRace)
    const lookup = (await lookupRepository.findLookup({ companyId, lookupId }))!
    await distributionPersist(keys.repositoryRace, importId, '000000000000081')
    const sourceBytes = Buffer.from('<nfeProc/>')

    const result = await lookupRepository.importDocument({
      cStat: '138',
      lookup,
      now: NOW,
      prepared: {
        accessKey: keys.repositoryRace,
        dfe: procNfeItem(),
        normalizedXml: importedXml(keys.repositoryRace),
        sourceBytes,
        sourceSha256: 'b'.repeat(64),
        variant: 'complete',
      },
      storedObject: {
        bucket: BUCKET,
        key: `tenants/${companyId}/nfe-documents/${keys.repositoryRace}/original.xml`,
        objectId: crypto.randomUUID(),
        sha256: 'b'.repeat(64),
        sizeBytes: sourceBytes.byteLength,
      },
    })

    expect(result.isDuplicate).toBe(true)
    expect(await countDocuments(keys.repositoryRace)).toBe(1)
    expect(await readLookup(lookupId)).toMatchObject({
      documentId: result.documentId,
      status: 'imported',
    })
  })

  it('closes a refused lookup and fails its import with the reason', async () => {
    gatewayResult = { cStat: '640', kind: 'sefaz-rejection' }
    const { envelope, importId, lookupId } = await seedLookup(keys.refused)

    await useCase.execute(envelope)

    const lookup = await readLookup(lookupId)
    expect(lookup).toMatchObject({ cStat: '640', reason: 'not_interested', status: 'refused' })
    expect(lookup.finishedAt).not.toBeNull()
    expect(await readImport(importId)).toMatchObject({
      processedCount: 0n,
      status: 'failed',
      terminalError: { reason: 'not_interested' },
    })
    expect(await countDocuments(keys.refused)).toBe(0)
  })

  it('the relay claim returns the lookup id of an access key event', async () => {
    const { eventId, importId, lookupId } = await seedLookup(keys.outbox, { isPublished: false })

    const claimed = await outboxRepository.claimDueEntries({
      claimOwner: 'integration-relay',
      leaseMs: 30_000,
      limit: 500,
      now: new Date(Date.now() + 1_000),
    })

    const entry = claimed.find((candidate) => candidate.eventId === eventId)
    expect(entry).toMatchObject({
      eventType: 'transportada.nfe.access-key.requested',
      importId,
      lookupId,
    })
  })
})
