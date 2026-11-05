/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 T013: a CNH anexada à ficha do motorista, do outbox ao campo gravado, com infra de verdade
 * (Postgres e RabbitMQ): linha de `fleet_driver_attachment_outbox` → relay → broker → consumidor →
 * objeto no bucket → `fleet_driver_attachments.extracted_fields`. A leitura em si é dublê: a thread do
 * pdf.js já é provada pelo trilho da candidatura, e o que muda aqui é a costura — o `subject` decide a
 * tabela, e a leitura que chega **depois** da decisão do operador não devolve o dado descartado.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createRabbitMqProvider, type RabbitMqConsumer } from '@adatechnology/rabbitmq-provider'
import { eq } from 'drizzle-orm'

import { createInMemoryObjectStorageProvider } from '../fixtures/in-memory-object-storage.fixture.js'
import { AggregateAttachmentOutboxPublisherService } from '../../src/aggregate-attachment/application/aggregate-attachment-outbox-publisher.service.js'
import { AggregateAttachmentOutboxRelayService } from '../../src/aggregate-attachment/application/aggregate-attachment-outbox-relay.service.js'
import { DrizzleAggregateAttachmentOutboxRepository } from '../../src/aggregate-attachment/infrastructure/drizzle-aggregate-attachment-outbox.repository.js'
import { createDrizzleAggregateAttachmentWriteBackRepository } from '../../src/aggregate-attachment/infrastructure/drizzle-aggregate-attachment-write-back.repository.js'
import { createDrizzleFleetDriverAttachmentWriteBackRepository } from '../../src/aggregate-attachment/infrastructure/drizzle-fleet-driver-attachment-write-back.repository.js'
import { createStorageAttachmentReaderGateway } from '../../src/aggregate-attachment/infrastructure/storage-attachment-reader.gateway.js'
import {
  aggregateApplicationAttachments,
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
} from '../../src/database/aggregate-attachment.schema.js'
import { buildAggregateAttachmentRabbitMqTopology } from '../../src/messaging/aggregate-attachment-rabbitmq-topology.js'
import { startAggregateAttachmentConsumer } from '../../src/runtime/aggregate-attachment-consumer.service.js'

const rabbitMqUrl = process.env.RABBITMQ_TEST_URL ?? process.env.RABBITMQ_URL
const databaseUrl = process.env.DATABASE_URL
const bucket = 'transportada-test'
const canRun = rabbitMqUrl !== undefined && databaseUrl !== undefined
const describeIntegration = canRun ? describe : describe.skip
const PIPELINE_TIMEOUT_MS = 60_000
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

const silentLogger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  flush: async (): Promise<void> => undefined,
  info: (): void => undefined,
  stop: (): void => undefined,
  warn: (): void => undefined,
}

async function relayUntilPublished(
  relayService: AggregateAttachmentOutboxRelayService,
  timeoutMs = 10_000,
): Promise<{ readonly claimedCount: number; readonly publishedCount: number }> {
  const deadline = Date.now() + timeoutMs
  let last = { claimedCount: 0, publishedCount: 0 }
  while (Date.now() < deadline) {
    last = await relayService.relayDueEntries({
      claimOwner: 'integration',
      leaseMs: 30_000,
      limit: 10,
    })
    if (last.publishedCount > 0) return last
    await Bun.sleep(50)
  }
  return last
}

async function waitFor<T>(operation: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await operation()
    if (result !== undefined && result !== null) return result
    await Bun.sleep(50)
  }
  throw new Error(`fleet driver attachment pipeline timed out after ${timeoutMs}ms`)
}

describeIntegration('anexo da ficha do motorista — do outbox ao campo gravado', () => {
  const prefix = `transportada.driver-attachment.test.${crypto.randomUUID()}`
  const topology = buildAggregateAttachmentRabbitMqTopology({ queuePrefix: prefix })
  let admin: SQL
  let database: ReturnType<typeof createDrizzleProvider>
  let databaseName: string
  let provider: Awaited<ReturnType<typeof createRabbitMqProvider>>
  let consumer: RabbitMqConsumer | undefined
  let storage: Awaited<ReturnType<typeof buildStorage>>
  let relay: AggregateAttachmentOutboxRelayService

  async function buildStorage() {
    const { createNfeStorageGateway } = await import(
      '../../src/storage/infrastructure/nfe-storage-gateway.js'
    )
    return createNfeStorageGateway({
      provider: createInMemoryObjectStorageProvider({ maxObjectSizeBytes: 25 * 1024 * 1024 }),
      finalBucket: bucket,
      stagingBucket: bucket,
    })
  }

  beforeAll(async () => {
    admin = new SQL(databaseUrl as string, { max: 1 })
    databaseName = `transportada_driverattach_${crypto.randomUUID().replaceAll('-', '')}`
    await admin.unsafe(`create database "${databaseName}"`)

    const disposableUrl = new URL(databaseUrl as string)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    // As migrations só existem na API: as tabelas deste trilho nascem aqui com a mesma forma delas.
    await database.db.execute(`
      create table "aggregate_application_attachments" (
        "id" uuid primary key default gen_random_uuid(),
        "company_id" uuid not null,
        "type" text not null,
        "extracted_fields" jsonb,
        "updated_at" timestamptz not null default now()
      );
      create table "fleet_driver_attachments" (
        "id" uuid primary key default gen_random_uuid(),
        "company_id" uuid not null,
        "type" text not null,
        "extracted_fields" jsonb,
        "extracted_at" timestamptz,
        "decision" text,
        constraint "decided_without_fields" check ("decision" is null or "extracted_fields" is null)
      );
      create table "fleet_driver_attachment_outbox" (
        "id" uuid primary key default gen_random_uuid(),
        "event_id" uuid not null default gen_random_uuid(),
        "company_id" uuid not null,
        "attachment_id" uuid not null,
        "event_type" text not null,
        "event_version" bigint not null default 1,
        "correlation_id" text not null,
        "payload" jsonb not null,
        "attempt" bigint not null default 0,
        "claim_owner" text,
        "claim_expires_at" timestamptz,
        "next_attempt_at" timestamptz not null default now(),
        "published_at" timestamptz,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `)

    provider = await createRabbitMqProvider({ connection: rabbitMqUrl as string, topology })
    storage = await buildStorage()

    consumer = await startAggregateAttachmentConsumer({
      config: { prefetch: 1 } as never,
      dependencies: {
        driverWriteBack: createDrizzleFleetDriverAttachmentWriteBackRepository(database.db),
        extraction: {
          extract: async () => ({ licenseCategory: 'D', licenseNumber: '01234567890' }),
        },
        reader: createStorageAttachmentReaderGateway({ storage }),
        writeBack: createDrizzleAggregateAttachmentWriteBackRepository(database.db),
      },
      logger: silentLogger as never,
      provider,
    })

    relay = new AggregateAttachmentOutboxRelayService({
      clock: { now: () => new Date() },
      publisher: new AggregateAttachmentOutboxPublisherService(provider),
      repository: new DrizzleAggregateAttachmentOutboxRepository(
        database.db,
        fleetDriverAttachmentOutbox,
      ),
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('relay publish failed')
        },
      },
      subject: 'fleet_driver',
    })
  })

  afterAll(async () => {
    await consumer?.cancel().catch(() => undefined)
    await provider?.close().catch(() => undefined)
    await storage?.close().catch(() => undefined)
    await database?.close().catch(() => undefined)
    await admin
      .unsafe(`drop database if exists "${databaseName}" with (force)`)
      .catch(() => undefined)
    await admin.close({ timeout: 0 })
  })

  async function enqueue(input: { readonly decided?: boolean }) {
    const companyId = crypto.randomUUID()
    const objectKey = `tenants/${companyId}/fleet-driver-attachments/${crypto.randomUUID()}/cnh/${crypto.randomUUID()}`
    await storage.storeObject({
      body: PDF_BYTES,
      bucket,
      contentLength: PDF_BYTES.byteLength,
      contentType: 'application/pdf',
      key: objectKey,
      sha256: Bun.SHA256.hash(PDF_BYTES, 'hex'),
    })
    const [attachment] = await database.db
      .insert(fleetDriverAttachments)
      .values({
        companyId,
        type: 'cnh',
        ...(input.decided === true ? { decision: 'dismissed' } : {}),
      })
      .returning({ id: fleetDriverAttachments.id })
    const attachmentId = attachment?.id as string
    await database.db.insert(fleetDriverAttachmentOutbox).values({
      attachmentId,
      companyId,
      correlationId: 'correlation-091',
      eventType: 'attachment.extraction.requested',
      payload: { attachmentId, bucket, objectKey, type: 'cnh' },
    })
    return { attachmentId, companyId }
  }

  test(
    'a CNH anexada chega à ficha como campo lido, e só na tabela do motorista',
    async () => {
      const { attachmentId, companyId } = await enqueue({})

      expect(await relayUntilPublished(relay)).toEqual({ claimedCount: 1, publishedCount: 1 })

      const row = await waitFor(async () => {
        const [found] = await database.db
          .select()
          .from(fleetDriverAttachments)
          .where(eq(fleetDriverAttachments.id, attachmentId))
        return found?.extractedAt === null ? undefined : found
      })

      expect(row.extractedFields).toEqual({ licenseCategory: 'D', licenseNumber: '01234567890' })
      expect(row.companyId).toBe(companyId)
      expect(await database.db.select().from(aggregateApplicationAttachments)).toEqual([])
      const [event] = await database.db
        .select({ publishedAt: fleetDriverAttachmentOutbox.publishedAt })
        .from(fleetDriverAttachmentOutbox)
        .where(eq(fleetDriverAttachmentOutbox.companyId, companyId))
      expect(event?.publishedAt).not.toBeNull()
    },
    PIPELINE_TIMEOUT_MS,
  )

  /** O operador já decidiu e o dado pessoal foi descartado: leitura atrasada não o traz de volta. */
  test(
    'leitura que chega depois da decisão não grava',
    async () => {
      const { attachmentId } = await enqueue({ decided: true })

      expect(await relayUntilPublished(relay)).toEqual({ claimedCount: 1, publishedCount: 1 })
      await Bun.sleep(1_500)

      const [row] = await database.db
        .select()
        .from(fleetDriverAttachments)
        .where(eq(fleetDriverAttachments.id, attachmentId))
      expect(row?.extractedFields).toBeNull()
      expect(row?.extractedAt).toBeNull()
    },
    PIPELINE_TIMEOUT_MS,
  )
})
