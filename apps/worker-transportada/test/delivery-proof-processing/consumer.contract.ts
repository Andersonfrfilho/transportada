/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF6/RF13: o consumidor devolve ao broker a disposição certa — ack, retry e, esgotadas as
 * tentativas, fila morta **depois** de marcar `processing_failed` com o original mantido — e o log
 * `delivery_proof_processing` leva variante, tamanhos, duração e resultado, nunca conteúdo.
 */
import { describe, expect, test } from 'bun:test'
import type {
  RabbitMqDisposition,
  RabbitMqMessageHandler,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'

import { startDeliveryProofProcessingConsumer } from '../../src/runtime/delivery-proof-processing-consumer.service.js'
import { buildDeliveryProofProcessingRabbitMqTopology } from '../../src/messaging/delivery-proof-processing-rabbitmq-topology.js'
import type { ProcessDeliveryProofDependencies } from '../../src/delivery-proof-processing/application/process-delivery-proof.use-case.js'
import {
  BUCKET,
  buildEnvelope,
  createFakeImagePort,
  createInMemoryObjectStorage,
  createInMemoryProofRepository,
  createRecordingLogger,
  ORIGINAL_BYTES,
  ORIGINAL_KEY,
  ORIGINAL_OBJECT_ID,
  processedResult,
  PROOF_ID,
} from '../fixtures/delivery-proof-processing-doubles.fixture.js'

type Captured = {
  decode?: (value: unknown) => unknown
  handler?: RabbitMqMessageHandler<unknown>
  prefetch?: number
}

async function startConsumer(options: {
  readonly image: ReturnType<typeof createFakeImagePort>
  readonly maxRetries?: number
  readonly repo?: ReturnType<typeof createInMemoryProofRepository>
}) {
  const captured: Captured = {}
  const provider = {
    async consume(params: Captured) {
      Object.assign(captured, params)
      return { cancel: async (): Promise<void> => undefined, consumerTag: 'test' }
    },
  } as unknown as RabbitMqProvider
  const repo = options.repo ?? createInMemoryProofRepository()
  const storage = createInMemoryObjectStorage(
    new Map([[`${BUCKET}/${ORIGINAL_KEY}`, ORIGINAL_BYTES]]),
  )
  const { entries, logger } = createRecordingLogger()
  const dependencies: ProcessDeliveryProofDependencies = {
    image: options.image.port,
    logger,
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date(),
    objects: storage.storage,
    repository: repo.repository,
  }
  await startDeliveryProofProcessingConsumer({
    dependencies,
    logger,
    maxRetries: options.maxRetries ?? 4,
    provider,
  })

  async function deliver(retryCount: number): Promise<RabbitMqDisposition> {
    const handler = captured.handler
    if (handler === undefined) throw new Error('consumer was not started')
    return handler({
      headers: {},
      payload: captured.decode?.(buildEnvelope()),
      redelivered: retryCount > 0,
      retryCount,
    })
  }

  return { captured, deliver, entries, repo, storage }
}

describe('consumidor do trilho delivery-proof-processing (spec 265)', () => {
  test('consome uma mensagem por vez: a thread aloca até 160 MiB de pixels', async () => {
    const { captured } = await startConsumer({ image: createFakeImagePort(processedResult()) })

    expect(captured.prefetch).toBe(1)
  })

  test('sucesso é ack e deixa o log com variante, tamanhos, duração e resultado, sem conteúdo', async () => {
    const { deliver, entries } = await startConsumer({
      image: createFakeImagePort(processedResult({ barcodeText: 'segredo-lido' })),
    })

    expect(await deliver(0)).toEqual({ type: 'ack' })

    const entry = entries.find((candidate) => candidate.message === 'delivery_proof_processing')
    expect(entry?.level).toBe('info')
    expect(entry?.metadata).toMatchObject({
      companyId: expect.any(String),
      originalBytes: ORIGINAL_BYTES.byteLength,
      outcome: 'ready',
      proofId: PROOF_ID,
      reducedBytes: expect.any(Number),
      variant: 'original',
    })
    expect((entry?.metadata as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(entries)).not.toContain('segredo-lido')
    expect(JSON.stringify(entries)).not.toContain(ORIGINAL_KEY)
  })

  test('falha de infraestrutura dentro das tentativas é retry, sem marcar nada', async () => {
    const image = createFakeImagePort(async () => {
      throw new Error('thread died')
    })
    const { deliver, repo } = await startConsumer({ image })

    expect(await deliver(0)).toEqual({ type: 'retry' })
    expect(await deliver(3)).toEqual({ type: 'retry' })

    expect(repo.proof.state).toBe('processing')
  })

  test('tentativas esgotadas: processing_failed com o original mantido, e fila morta', async () => {
    const image = createFakeImagePort(async () => {
      throw new Error('thread died')
    })
    const { deliver, entries, repo, storage } = await startConsumer({ image, maxRetries: 4 })

    expect(await deliver(4)).toEqual({ type: 'dead-letter' })

    expect(repo.proof.state).toBe('processing_failed')
    expect(repo.proof.processingError).toBe('PROCESSING_ABANDONED')
    expect(repo.proof.originalObjectId).toBe(ORIGINAL_OBJECT_ID)
    expect(storage.has(ORIGINAL_KEY)).toBe(true)
    const entry = entries.find((candidate) => candidate.message === 'delivery_proof_processing')
    expect(entry?.level).toBe('error')
    expect(entry?.metadata).toMatchObject({ outcome: 'abandoned', reason: 'Error' })
    // O erro não vira texto no banco nem no log: só a classe.
    expect(JSON.stringify(entries)).not.toContain('thread died')
  })

  test('o original ausente esgotado grava o código do que faltou, não um texto', async () => {
    const image = createFakeImagePort(processedResult())
    const { deliver, repo, storage } = await startConsumer({ image })
    storage.blobs.clear()

    expect(await deliver(4)).toEqual({ type: 'dead-letter' })

    expect(repo.proof.processingError).toBe('ORIGINAL_MISSING')
  })

  test('a reentrega depois de ready é ack sem trabalho', async () => {
    const image = createFakeImagePort(processedResult())
    const { deliver, repo } = await startConsumer({ image })
    expect(await deliver(0)).toEqual({ type: 'ack' })
    const requests = image.requests.length

    expect(await deliver(1)).toEqual({ type: 'ack' })

    expect(image.requests.length).toBe(requests)
    expect(repo.proof.state).toBe('ready')
  })

  test('a topologia tem main, retry e dead com o prefixo da fila', () => {
    const topology = buildDeliveryProofProcessingRabbitMqTopology({ queuePrefix: 'transportada' })

    expect(topology.exchange).toBe('transportada.delivery-proof-processing.v1.main.exchange')
    expect(topology.queue).toBe('transportada.delivery-proof-processing.v1.main.queue')
    expect(topology.retry?.queue).toBe('transportada.delivery-proof-processing.v1.retry.queue')
    expect(topology.retry?.maxRetries).toBeGreaterThan(0)
    expect(topology.deadLetter?.queue).toBe('transportada.delivery-proof-processing.v1.dead.queue')
  })
})
