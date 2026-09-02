/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O caminho inteiro da spec 070 depois do `201`, com infra de verdade: linha de
 * `aggregate_attachment_outbox` → relay → RabbitMQ → consumidor → objeto no bucket → parse do pdf.js
 * numa `worker_thread` → `extracted_fields` no Postgres.
 *
 * Nada aqui é dublê. É o único lugar onde se prova que a thread encontra o próprio módulo em disco,
 * que o `payload jsonb` sobrevive à ida e à volta pelo broker, e que o campo lido chega ao anexo — os
 * contratos provam cada peça, e nenhum deles provaria a costura.
 *
 * A metade de escrita (o upload gravando objeto, rascunho e evento numa transação) vive no
 * `api-transportada`: nenhuma app importa código-fonte de outra, e o seam entre as duas é a linha do
 * outbox, afirmada dos dois lados.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createRabbitMqProvider, type RabbitMqConsumer } from '@adatechnology/rabbitmq-provider'
import { eq } from 'drizzle-orm'

import { AggregateAttachmentOutboxPublisherService } from '../../src/aggregate-attachment/application/aggregate-attachment-outbox-publisher.service.js'
import { AggregateAttachmentOutboxRelayService } from '../../src/aggregate-attachment/application/aggregate-attachment-outbox-relay.service.js'
import { DrizzleAggregateAttachmentOutboxRepository } from '../../src/aggregate-attachment/infrastructure/drizzle-aggregate-attachment-outbox.repository.js'
import { createDrizzleAggregateAttachmentWriteBackRepository } from '../../src/aggregate-attachment/infrastructure/drizzle-aggregate-attachment-write-back.repository.js'
import { createStorageAttachmentReaderGateway } from '../../src/aggregate-attachment/infrastructure/storage-attachment-reader.gateway.js'
import { createDocumentExtractionGateway } from '../../src/aggregate-attachment/infrastructure/document-extraction.gateway.js'
import { createThreadedAttachmentExtractionGateway } from '../../src/aggregate-attachment/infrastructure/threaded-extraction.gateway.js'
import {
  aggregateApplicationAttachments,
  aggregateAttachmentOutbox,
} from '../../src/database/aggregate-attachment.schema.js'
import { buildAggregateAttachmentRabbitMqTopology } from '../../src/messaging/aggregate-attachment-rabbitmq-topology.js'
import { startAggregateAttachmentConsumer } from '../../src/runtime/aggregate-attachment-consumer.service.js'
import { buildSyntheticCcmei, buildSyntheticCrlv } from './ccmei-pdf.helper.js'

const rabbitMqUrl = process.env.RABBITMQ_TEST_URL ?? process.env.RABBITMQ_URL
const databaseUrl = process.env.DATABASE_URL
const bucket = process.env.STORAGE_BUCKET

const canRun = rabbitMqUrl !== undefined && databaseUrl !== undefined && bucket !== undefined
const describeIntegration = canRun ? describe : describe.skip

const PIPELINE_TIMEOUT_MS = 60_000
const CNPJ_ON_THE_DOCUMENT = '30.213.061/0001-06'

const silentLogger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  flush: async (): Promise<void> => undefined,
  info: (): void => undefined,
  stop: (): void => undefined,
  warn: (): void => undefined,
}

async function waitFor<T>(operation: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await operation()
    if (result !== undefined && result !== null) return result
    await Bun.sleep(50)
  }
  throw new Error(`aggregate attachment pipeline timed out after ${timeoutMs}ms`)
}

describeIntegration('anexo do agregado — do outbox ao campo gravado', () => {
  const prefix = `transportada.attachment.test.${crypto.randomUUID()}`
  const topology = buildAggregateAttachmentRabbitMqTopology({ queuePrefix: prefix })
  let admin: SQL
  let database: ReturnType<typeof createDrizzleProvider>
  let databaseName: string
  let provider: Awaited<ReturnType<typeof createRabbitMqProvider>>
  let consumer: RabbitMqConsumer | undefined
  let storage: Awaited<ReturnType<typeof buildStorage>>
  let relay: AggregateAttachmentOutboxRelayService

  async function buildStorage() {
    const { createNfeStorageGatewayFromEnvironment } = await import(
      '../../src/storage/infrastructure/nfe-storage-gateway.js'
    )
    return createNfeStorageGatewayFromEnvironment({
      environment: process.env,
      finalBucket: bucket as string,
      stagingBucket: bucket as string,
    })
  }

  beforeAll(async () => {
    admin = new SQL(databaseUrl as string, { max: 1 })
    databaseName = `transportada_attachpipe_${crypto.randomUUID().replaceAll('-', '')}`
    await admin.unsafe(`create database "${databaseName}"`)

    const disposableUrl = new URL(databaseUrl as string)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    /**
     * Migrations só existem na API, e o worker não importa código dela — então as duas tabelas que
     * este caminho toca são criadas aqui, com a mesma forma que a migration versiona. A paridade
     * real é assunto do contrato de schema; aqui o que se prova é o trilho.
     */
    await database.db.execute(`
      create table "aggregate_application_attachments" (
        "id" uuid primary key default gen_random_uuid(),
        "company_id" uuid not null,
        "type" text not null,
        "extracted_fields" jsonb,
        "updated_at" timestamptz not null default now()
      );
      create table "aggregate_attachment_outbox" (
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

    /** Um consumidor e um relay para os dois documentos: é o mesmo trilho, e é isso que se prova. */
    consumer = await startAggregateAttachmentConsumer({
      config: { prefetch: 1 } as never,
      dependencies: {
        extraction: createDocumentExtractionGateway({
          textLayer: createThreadedAttachmentExtractionGateway(),
        }),
        reader: createStorageAttachmentReaderGateway({ storage }),
        writeBack: createDrizzleAggregateAttachmentWriteBackRepository(database.db),
      },
      logger: silentLogger as never,
      provider,
    })

    relay = new AggregateAttachmentOutboxRelayService({
      clock: { now: () => new Date() },
      publisher: new AggregateAttachmentOutboxPublisherService(provider),
      repository: new DrizzleAggregateAttachmentOutboxRepository(database.db),
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('relay publish failed')
        },
      },
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

  test(
    'o CCMEI enviado chega ao anexo como campo lido, sem ninguém ler na requisição',
    async () => {
      const companyId = crypto.randomUUID()
      const bytes = buildSyntheticCcmei(CNPJ_ON_THE_DOCUMENT)
      const objectKey = `tenants/${companyId}/aggregate-application-attachments/ccmei/${crypto.randomUUID()}`

      await storage.storeObject({
        body: bytes,
        bucket: bucket as string,
        contentLength: bytes.byteLength,
        contentType: 'application/pdf',
        key: objectKey,
        sha256: Bun.SHA256.hash(bytes, 'hex'),
      })

      const [attachment] = await database.db
        .insert(aggregateApplicationAttachments)
        .values({ companyId, type: 'ccmei' })
        .returning({ id: aggregateApplicationAttachments.id })
      const attachmentId = attachment?.id as string

      await database.db.insert(aggregateAttachmentOutbox).values({
        attachmentId,
        companyId,
        correlationId: 'correlation-070-pipeline',
        eventType: 'attachment.extraction.requested',
        payload: { attachmentId, bucket, objectKey, type: 'ccmei' },
      })

      const relayed = await relay.relayDueEntries({
        claimOwner: 'integration',
        leaseMs: 30_000,
        limit: 10,
      })
      expect(relayed).toEqual({ claimedCount: 1, publishedCount: 1 })

      const extracted = await waitFor(async () => {
        const [row] = await database.db
          .select({ extractedFields: aggregateApplicationAttachments.extractedFields })
          .from(aggregateApplicationAttachments)
          .where(eq(aggregateApplicationAttachments.id, attachmentId))
        return row?.extractedFields ?? undefined
      })

      /** O CNPJ que a thread leu do PDF que foi ao bucket e voltou — não um valor inventado no teste. */
      expect(extracted).toMatchObject({ cnpj: '30213061000106' })

      const [event] = await database.db
        .select({ publishedAt: aggregateAttachmentOutbox.publishedAt })
        .from(aggregateAttachmentOutbox)
        .where(eq(aggregateAttachmentOutbox.companyId, companyId))
      expect(event?.publishedAt).not.toBeNull()
    },
    PIPELINE_TIMEOUT_MS,
  )

  /**
   * Spec 071: o mesmo trilho, com o CRLV. O que este teste prova e nenhum contrato provaria é que a
   * escolha por **assinatura** encontra o PDF depois da ida e da volta pelo bucket e pelo broker, e
   * que `readCrlv` — que agora vem do pacote, não do painel — chega ao anexo como campo gravado.
   *
   * O proprietário e o município vão junto de propósito: são o que faz o CRLV atravessar bloco do
   * formulário, e é neles que uma leitura pela metade passaria despercebida.
   */
  test(
    'o CRLV enviado chega ao anexo com veículo, proprietário e município lidos',
    async () => {
      const companyId = crypto.randomUUID()
      const bytes = buildSyntheticCrlv()
      const objectKey = `tenants/${companyId}/aggregate-application-attachments/crlv/${crypto.randomUUID()}`

      await storage.storeObject({
        body: bytes,
        bucket: bucket as string,
        contentLength: bytes.byteLength,
        contentType: 'application/pdf',
        key: objectKey,
        sha256: Bun.SHA256.hash(bytes, 'hex'),
      })

      const [attachment] = await database.db
        .insert(aggregateApplicationAttachments)
        .values({ companyId, type: 'crlv' })
        .returning({ id: aggregateApplicationAttachments.id })
      const attachmentId = attachment?.id as string

      await database.db.insert(aggregateAttachmentOutbox).values({
        attachmentId,
        companyId,
        correlationId: 'correlation-071-crlv',
        eventType: 'attachment.extraction.requested',
        payload: { attachmentId, bucket, objectKey, type: 'crlv' },
      })

      const relayed = await relay.relayDueEntries({
        claimOwner: 'integration',
        leaseMs: 30_000,
        limit: 10,
      })
      expect(relayed.publishedCount).toBeGreaterThanOrEqual(1)

      const extracted = await waitFor(async () => {
        const [row] = await database.db
          .select({ extractedFields: aggregateApplicationAttachments.extractedFields })
          .from(aggregateApplicationAttachments)
          .where(eq(aggregateApplicationAttachments.id, attachmentId))
        return row?.extractedFields ?? undefined
      })

      expect(extracted).toMatchObject({
        municipality: 'SAO PAULO',
        ownerName: 'MARIA DE SOUSA',
        ownerTaxId: '11144477735',
        plate: 'GCQ8E47',
        state: 'SP',
      })
    },
    PIPELINE_TIMEOUT_MS,
  )
})
