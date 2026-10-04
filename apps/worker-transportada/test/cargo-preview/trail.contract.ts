/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 4a: o envelope leva referência e nunca bytes; o trilho tem main/retry/dead; o
 * consumidor confirma o que terminou (inclusive a prévia que falhou por arquivo ruim) e devolve à
 * fila só a falha de infraestrutura.
 */
import { describe, expect, test } from 'bun:test'
import type { RabbitMqDisposition, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { CargoPreviewOutboxRelayService } from '../../src/cargo-preview/application/cargo-preview-outbox-relay.service.js'
import {
  CARGO_PREVIEW_EVENT_TYPE,
  cargoPreviewEnvelopeV1Schema,
  type CargoPreviewEnvelopeV1,
} from '../../src/messaging/cargo-preview-envelope.schema.js'
import { buildCargoPreviewRabbitMqTopology } from '../../src/messaging/cargo-preview-rabbitmq-topology.js'
import { startCargoPreviewConsumer } from '../../src/runtime/cargo-preview-consumer.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000b1'
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000b2'
const REEVALUATE: CargoPreviewEnvelopeV1 = {
  companyId: COMPANY_ID,
  correlationId: 'correlation-2',
  eventId: '00000000-0000-4000-8000-0000000000b3',
  occurredAt: '2026-10-04T12:00:00.000Z',
  payload: { contractorId: CONTRACTOR_ID },
  type: CARGO_PREVIEW_EVENT_TYPE.REEVALUATE,
  version: 1,
}

describe('o envelope e o trilho da prévia (spec 237 Fase 4a)', () => {
  test('o envelope é estrito: bytes ou linha da planilha não atravessam o broker', () => {
    expect(cargoPreviewEnvelopeV1Schema.safeParse(REEVALUATE).success).toBeTrue()
    const withBytes = { ...REEVALUATE, payload: { ...REEVALUATE.payload, bytes: 'UEsDBA==' } }
    expect(cargoPreviewEnvelopeV1Schema.safeParse(withBytes).success).toBeFalse()
  })

  test('main, retry e dead, com o prefixo da instalação', () => {
    const topology = buildCargoPreviewRabbitMqTopology({ queuePrefix: 'x' })
    expect(topology.queue).toBe('x.cargo-preview.v1.main.queue')
    expect(topology.retry?.queue).toBe('x.cargo-preview.v1.retry.queue')
    expect(topology.deadLetter?.queue).toBe('x.cargo-preview.v1.dead.queue')
  })

  test('o relay publica o envelope do outbox e marca publicado', async () => {
    const published: CargoPreviewEnvelopeV1[] = []
    const marked: string[] = []
    const relay = new CargoPreviewOutboxRelayService({
      now: () => new Date('2026-10-04T12:00:00.000Z'),
      publisher: { publish: async (envelope) => void published.push(envelope) },
      repository: {
        claimDueEntries: async () => [{ claimOwner: 'owner', envelope: REEVALUATE }],
        markPublished: async ({ eventId }) => void marked.push(eventId),
      },
    })
    expect(await relay.relayDueEntries({ claimOwner: 'owner', leaseMs: 1, limit: 1 })).toEqual({
      claimedCount: 1,
      publishedCount: 1,
    })
    expect(published).toEqual([REEVALUATE])
    expect(marked).toEqual([REEVALUATE.eventId])
  })
})

describe('o consumidor da prévia (spec 237 T4.3)', () => {
  async function consume(reevaluate: () => Promise<never> | Promise<object>) {
    let handler:
      | ((input: {
          payload: CargoPreviewEnvelopeV1
          retryCount: number
        }) => Promise<RabbitMqDisposition>)
      | undefined
    const logs: string[] = []
    const provider = {
      consume: async (options: { handler: typeof handler }) => {
        handler = options.handler
        return { cancel: async () => undefined }
      },
    } as unknown as RabbitMqProvider
    await startCargoPreviewConsumer({
      dependencies: {
        clock: () => 0,
        now: () => new Date(),
        reader: { read: async () => undefined },
        repository: { reevaluate } as never,
      },
      logger: {
        error: (message) => logs.push(message),
        info: (message) => logs.push(message),
        warn: (message) => logs.push(message),
      },
      maxRetries: 5,
      provider,
    })
    const disposition = await handler?.({ payload: REEVALUATE, retryCount: 0 })
    return { disposition, logs }
  }

  test('reavaliação feita é ack, com contagens no log', async () => {
    const result = await consume(async () => ({ aliasConflicts: 1, changedItems: 3, previews: 1 }))
    expect(result.disposition).toEqual({ type: 'ack' })
    expect(result.logs).toEqual(['cargo_preview_reevaluated', 'cargo_preview_alias_conflict'])
  })

  test('banco fora do ar é retry, nunca ack', async () => {
    const result = await consume(async () => {
      throw new Error('connection refused')
    })
    expect(result.disposition).toEqual({ type: 'retry' })
    expect(result.logs).toEqual(['cargo_preview_failed'])
  })
})

describe('a leitura que esgota a fila não fica em processing para sempre (spec 237 M1)', () => {
  const PROCESS: CargoPreviewEnvelopeV1 = {
    ...REEVALUATE,
    payload: {
      bucket: 'private',
      contractorId: CONTRACTOR_ID,
      objectKey: 'k',
      previewId: '00000000-0000-4000-8000-0000000000b4',
    },
    type: CARGO_PREVIEW_EVENT_TYPE.PROCESS,
  }
  const MAX_RETRIES = 5

  async function deliver(retryCount: number) {
    let handler:
      | ((input: {
          payload: CargoPreviewEnvelopeV1
          retryCount: number
        }) => Promise<RabbitMqDisposition>)
      | undefined
    const failed: string[] = []
    const provider = {
      consume: async (options: { handler: typeof handler }) => {
        handler = options.handler
        return { cancel: async () => undefined }
      },
    } as unknown as RabbitMqProvider
    await startCargoPreviewConsumer({
      dependencies: {
        clock: () => 0,
        now: () => new Date(),
        reader: {
          read: async () => {
            throw new Error('bucket down')
          },
        },
        repository: {
          findPreview: async () => ({
            contractorId: CONTRACTOR_ID,
            fileSha256: 'x',
            status: 'queued',
          }),
          findReadingProfile: async () => ({ columnMap: { routeName: 'R' }, sheetName: null }),
          markFailed: async ({ errorCode }: { errorCode: string }) => void failed.push(errorCode),
          markProcessing: async () => undefined,
        } as never,
      },
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      maxRetries: MAX_RETRIES,
      provider,
    })
    return { disposition: await handler?.({ payload: PROCESS, retryCount }), failed }
  }

  test('antes da última tentativa é retry, e a prévia segue aberta', async () => {
    expect(await deliver(MAX_RETRIES - 1)).toEqual({ disposition: { type: 'retry' }, failed: [] })
  })

  test('na última tentativa a prévia vira failed PREVIEW_PROCESSING_ABANDONED e a mensagem morre', async () => {
    expect(await deliver(MAX_RETRIES)).toEqual({
      disposition: { type: 'dead-letter' },
      failed: ['PREVIEW_PROCESSING_ABANDONED'],
    })
  })
})
