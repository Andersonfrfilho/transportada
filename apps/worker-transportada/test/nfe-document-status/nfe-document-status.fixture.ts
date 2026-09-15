/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml, NfeXmlDocument, NfeXmlEvent } from '@adatechnology/fiscal-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import {
  type NfeImportSource,
  nfeDocumentStatusChanges,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  storedObjects,
} from '../../src/database/nfe.schema.js'
import { DrizzleNfeDistributionRepository } from '../../src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-documents/domain/system-distribution-actor.constant.js'
import { DrizzleNfeImportConsumerRepository } from '../../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

export const DATABASE_URL = process.env.DATABASE_URL
export const TRAILS = ['import', 'distribution'] as const
export type Trail = (typeof TRAILS)[number]

const SHA256 = 'b'.repeat(64)
const BUCKET = 'transportada-private'
const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'

export type LogEntry = {
  readonly level: 'info' | 'warn'
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type Writers = {
  readonly close: () => Promise<void>
  readonly database: Database
  readonly distribution: DrizzleNfeDistributionRepository
  readonly imports: DrizzleNfeImportConsumerRepository
}

let sequence = 0
function nextSequence(): number {
  sequence += 1
  return sequence
}

/** 44 dígitos, únicos por processo: cada cenário tem a própria chave e não herda estado de outro. */
export function newAccessKey(): string {
  const random = Array.from({ length: 30 }, () => Math.floor(Math.random() * 10)).join('')
  return `35${String(nextSequence()).padStart(12, '0')}${random}`
}

function nextNsu(): string {
  return (
    String(Date.now() % 1_000_000_000).padStart(9, '0') + String(nextSequence()).padStart(6, '0')
  )
}

export function documentXml(params: {
  readonly accessKey: string
  readonly status?: 'authorized' | 'unsigned'
}): ImportedNfeXml {
  const common: Omit<NfeXmlDocument, 'protocol' | 'status'> = {
    accessKey: params.accessKey,
    issuedAt: '2026-07-22T22:00:00.000Z',
    issuer: { name: 'Emitente', taxId: EMITTER_TAX_ID },
    model: '55',
    number: '1',
    operationNature: 'Venda',
    operationType: '1',
    products: [],
    recipient: { name: 'Destinatario', taxId: RECIPIENT_TAX_ID },
    relatedCnpjs: [RECIPIENT_TAX_ID],
    series: '1',
    totals: { invoice: '10.0000', products: '10.0000' },
    volumes: [],
  }
  const item = { chaveNfe: params.accessKey, nsu: '', schema: 'xml-import', xmlComprimido: '' }
  if (params.status === 'unsigned') {
    return { ...item, document: { ...common, status: 'unsigned' }, kind: 'unsigned-nfe' }
  }
  return {
    ...item,
    document: {
      ...common,
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      status: 'authorized',
    },
    kind: 'authorized-nfe',
  }
}

export function eventXml(event: Omit<NfeXmlEvent, 'occurredAt'>): ImportedNfeXml {
  return {
    chaveNfe: event.accessKey,
    event: { ...event, occurredAt: '2026-07-22T23:00:00.000Z' },
    kind: 'nfe-event',
    nsu: '',
    schema: 'xml-import',
    xmlComprimido: '',
  }
}

export function createStatusHarness(label: string) {
  const logs: LogEntry[] = []
  const logger = {
    info(message: string, metadata?: Record<string, unknown>): void {
      logs.push({ level: 'info', message, metadata: metadata ?? {} })
    },
    warn(message: string, metadata?: Record<string, unknown>): void {
      logs.push({ level: 'warn', message, metadata: metadata ?? {} })
    },
  }
  const accessKeys = new Set<string>()
  const openedWriters: Writers[] = []
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()

  function connect(): Writers {
    const provider = createDrizzleProvider({ connection: DATABASE_URL! })
    const writers: Writers = {
      close: () => provider.close(),
      database: provider.db,
      distribution: new DrizzleNfeDistributionRepository(provider.db, {
        logger,
        storageProvider: 'minio',
      }),
      imports: new DrizzleNfeImportConsumerRepository(provider.db, {
        logger,
        storageProvider: 'minio',
      }),
    }
    openedWriters.push(writers)
    return writers
  }

  const main = connect()
  const db = main.database

  async function setup(): Promise<void> {
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into identity_users (id, status) values (${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}, 'active')
          on conflict (id) do nothing`,
    )
    for (const companyId of [companyA, companyB]) {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      for (const memberId of [userId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID]) {
        await db.execute(
          sql`insert into user_company_memberships (id, user_id, company_id, status)
              values (${crypto.randomUUID()}, ${memberId}, ${companyId}, 'active')`,
        )
      }
    }
  }

  async function cleanup(): Promise<void> {
    for (const companyId of [companyA, companyB]) {
      await db.execute(sql`delete from nfe_document_status_changes where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_addresses where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_participants where company_id = ${companyId}`)
      await db.execute(sql`delete from delivery_clients where company_id = ${companyId}`)
      await db.execute(sql`delete from contractors where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_documents where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_events where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_import_items where company_id = ${companyId}`)
      await db.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
      await db.execute(sql`delete from stored_objects where company_id = ${companyId}`)
      await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await Promise.all(openedWriters.map((writers) => writers.close()))
  }

  async function createImport(params: {
    readonly companyId: string
    readonly requestedByUserId: string
    readonly source: NfeImportSource
  }): Promise<string> {
    const importId = crypto.randomUUID()
    await db.insert(nfeImports).values({
      companyId: params.companyId,
      correlationId: `${label}-correlation`,
      id: importId,
      idempotencyKey: `idem-${importId}`,
      requestFingerprint: `fingerprint-${importId}`,
      requestedByUserId: params.requestedByUserId,
      source: params.source,
      status: 'processing',
    })
    return importId
  }

  async function write(params: {
    readonly companyId: string
    readonly importId: string
    readonly trail: Trail
    readonly writers?: Writers
    readonly xml: ImportedNfeXml
  }): Promise<void> {
    const writers = params.writers ?? main
    const accessKey =
      params.xml.kind === 'nfe-event' ? params.xml.event.accessKey : params.xml.document.accessKey
    accessKeys.add(accessKey)
    const objectId = crypto.randomUUID()
    const finalObject = {
      bucket: BUCKET,
      key: `tenants/${params.companyId}/${label}/${objectId}.xml`,
      objectId,
      sha256: SHA256,
      sizeBytes: 256,
    }

    if (params.trail === 'distribution') {
      const nsu = nextNsu()
      await writers.distribution.persistPage({
        companyId: params.companyId,
        environment: 'homologation',
        importId: params.importId,
        items: [
          {
            finalObject,
            normalizedXml: params.xml,
            nsu,
            variant: params.xml.kind === 'nfe-event' ? 'event' : 'complete',
          },
        ],
        maxNsu: '999999999999999',
        ultNsu: nsu,
      })
      return
    }

    const itemId = await insertPendingItem({
      companyId: params.companyId,
      importId: params.importId,
    })
    await writers.imports.completeItem({
      finalObject,
      itemId,
      normalizedXml: params.xml,
      status: 'imported',
    })
  }

  async function insertPendingItem(params: {
    readonly companyId: string
    readonly importId: string
  }): Promise<string> {
    const sourceObjectId = crypto.randomUUID()
    await db.insert(storedObjects).values({
      bucket: BUCKET,
      companyId: params.companyId,
      id: sourceObjectId,
      mimeType: 'application/xml',
      objectKey: `staging/${label}/${sourceObjectId}.xml`,
      provider: 'minio',
      purpose: 'import_source',
      sha256: SHA256,
      sizeBytes: 128n,
      status: 'staging',
    })
    const itemId = crypto.randomUUID()
    const ordinal = nextSequence()
    await db.insert(nfeImportItems).values({
      companyId: params.companyId,
      id: itemId,
      importId: params.importId,
      ordinal: BigInt(ordinal),
      sourceEntry: `item-${ordinal}.xml`,
      sourceName: `item-${ordinal}.xml`,
      sourceObjectId,
      sourceSha256: SHA256,
      status: 'pending',
    })
    return itemId
  }

  async function writeSummary(params: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly situation: string
  }): Promise<void> {
    accessKeys.add(params.accessKey)
    const objectId = crypto.randomUUID()
    const nsu = nextNsu()
    await main.distribution.persistPage({
      companyId: params.companyId,
      environment: 'homologation',
      importId: params.importId,
      items: [
        {
          finalObject: {
            bucket: BUCKET,
            key: `tenants/${params.companyId}/${label}/${objectId}.xml`,
            objectId,
            sha256: SHA256,
            sizeBytes: 256,
          },
          nsu,
          summary: { accessKey: params.accessKey, situacao: params.situation },
          variant: 'summary',
        },
      ],
      maxNsu: '999999999999999',
      ultNsu: nsu,
    })
  }

  /** Evento gravado antes da spec 149: nenhuma das colunas novas preenchida. */
  async function insertLegacyEvent(params: {
    readonly accessKey: string
    readonly companyId: string
    readonly type: string
  }): Promise<string> {
    accessKeys.add(params.accessKey)
    const objectId = crypto.randomUUID()
    await db.insert(storedObjects).values({
      bucket: BUCKET,
      companyId: params.companyId,
      id: objectId,
      mimeType: 'application/xml',
      objectKey: `tenants/${params.companyId}/${label}/legacy-${objectId}.xml`,
      provider: 'minio',
      purpose: 'nfe_event',
      sha256: SHA256,
      sizeBytes: 256n,
      status: 'final',
    })
    const [row] = await db
      .insert(nfeEvents)
      .values({
        companyId: params.companyId,
        eventSequence: 1n,
        eventType: params.type,
        occurredAt: new Date('2026-07-22T23:00:00.000Z'),
        targetAccessKey: params.accessKey,
        xmlObjectId: objectId,
      })
      .returning({ id: nfeEvents.id })
    return row!.id
  }

  return {
    accessKeys,
    cleanup,
    companyA,
    companyB,
    connect,
    createImport,
    db,
    insertLegacyEvent,
    logs,
    setup,
    userId,
    write,
    writeSummary,
  }
}

export type StatusHarness = ReturnType<typeof createStatusHarness>

export type DocumentSnapshot = {
  readonly createdMicros: bigint
  readonly id: string
  readonly status: string
  readonly updatedMicros: bigint
}

/** Microssegundos lidos no banco: `Date` truncaria em milissegundos e esconderia a diferença. */
export async function readDocument(params: {
  readonly accessKey: string
  readonly companyId: string
  readonly db: Database
}): Promise<DocumentSnapshot | undefined> {
  const rows = (await params.db.execute(sql`
    select id, status,
           (extract(epoch from created_at) * 1000000)::bigint::text as created_micros,
           (extract(epoch from updated_at) * 1000000)::bigint::text as updated_micros
      from nfe_documents
     where company_id = ${params.companyId} and access_key = ${params.accessKey}
  `)) as unknown as {
    created_micros: string
    id: string
    status: string
    updated_micros: string
  }[]
  const row = rows[0]
  if (row === undefined) return undefined
  return {
    createdMicros: BigInt(row.created_micros),
    id: row.id,
    status: row.status,
    updatedMicros: BigInt(row.updated_micros),
  }
}

export async function readEvents(params: {
  readonly accessKey: string
  readonly companyId: string
  readonly db: Database
}) {
  return params.db
    .select()
    .from(nfeEvents)
    .where(
      and(
        eq(nfeEvents.companyId, params.companyId),
        eq(nfeEvents.targetAccessKey, params.accessKey),
      ),
    )
    .orderBy(asc(nfeEvents.createdAt), asc(nfeEvents.id))
}

export async function readChanges(params: {
  readonly companyId: string
  readonly db: Database
  readonly documentId: string
}) {
  const rows = await params.db
    .select()
    .from(nfeDocumentStatusChanges)
    .where(
      and(
        eq(nfeDocumentStatusChanges.companyId, params.companyId),
        eq(nfeDocumentStatusChanges.documentId, params.documentId),
      ),
    )
  const micros = (await params.db.execute(sql`
    select id, (extract(epoch from changed_at) * 1000000)::bigint::text as changed_micros
      from nfe_document_status_changes
     where company_id = ${params.companyId} and document_id = ${params.documentId}
  `)) as unknown as { changed_micros: string; id: string }[]
  return rows.map((row) => ({
    ...row,
    changedMicros: BigInt(micros.find((entry) => entry.id === row.id)!.changed_micros),
  }))
}

export async function countWaitingAdvisoryLocks(database: Database): Promise<number> {
  const rows = (await database.execute(
    sql`select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted`,
  )) as unknown as { waiting: number }[]
  return rows[0]?.waiting ?? 0
}

export async function waitUntil(params: {
  readonly check: () => Promise<boolean>
  readonly timeoutMs: number
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs
  while (Date.now() < deadline) {
    if (await params.check()) return
    await Bun.sleep(20)
  }
  throw new Error('WAIT_UNTIL_TIMEOUT')
}

export function lockKey(params: {
  readonly accessKey: string
  readonly companyId: string
}): string {
  return `nfe-document-status:${params.companyId}:${params.accessKey}`
}

export { nfeImportItems }
