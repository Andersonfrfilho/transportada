/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createRabbitMqProvider, type RabbitMqConsumer } from '@adatechnology/rabbitmq-provider'
import { connect, type Channel, type ChannelModel, type GetMessage } from 'amqplib'
import {
  syntheticMessageEnvelopeV1Schema,
  type SyntheticMessageEnvelopeV1,
} from '../../src/messaging/message-envelope.schema.js'
import { buildRabbitMqTopology } from '../../src/messaging/rabbitmq-topology.js'

const rabbitMqUrl = process.env.RABBITMQ_TEST_URL ?? process.env.RABBITMQ_URL
const describeRabbitMq = rabbitMqUrl ? describe : describe.skip

const waitFor = async <T>(
  operation: () => Promise<T | undefined>,
  timeoutMs = 5_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await operation()
    if (result !== undefined) {
      return result
    }
    await Bun.sleep(25)
  }
  throw new Error(`RabbitMQ contract timed out after ${timeoutMs}ms`)
}

const getMessage = async (channel: Channel, queue: string): Promise<GetMessage | undefined> => {
  const message = await channel.get(queue, { noAck: true })
  return message === false ? undefined : message
}

const syntheticEnvelope = (operation: 'retry-once' | 'fatal'): SyntheticMessageEnvelopeV1 => ({
  eventId: crypto.randomUUID(),
  type: 'transportada.synthetic',
  version: 1,
  occurredAt: new Date().toISOString(),
  companyId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  payload: { operation },
})

describeRabbitMq('worker RabbitMQ integration', () => {
  const prefix = `transportada.worker.test.${crypto.randomUUID()}`
  const topology = buildRabbitMqTopology(prefix)
  let connection: ChannelModel
  let channel: Channel
  let provider: Awaited<ReturnType<typeof createRabbitMqProvider>>
  let consumer: RabbitMqConsumer | undefined

  beforeAll(async () => {
    connection = await connect(rabbitMqUrl!)
    channel = await connection.createChannel()
    provider = await createRabbitMqProvider({
      connection: rabbitMqUrl!,
      topology,
    })
  })

  afterAll(async () => {
    await consumer?.cancel().catch(() => undefined)
    await provider?.close().catch(() => undefined)

    if (channel) {
      for (const queue of [topology.queue, topology.retry.queue, topology.deadLetter.queue]) {
        await channel.deleteQueue(queue).catch(() => undefined)
      }
      for (const exchange of [
        topology.exchange,
        topology.retry.exchange,
        topology.deadLetter.exchange,
      ]) {
        await channel.deleteExchange(exchange).catch(() => undefined)
      }
      await channel.close().catch(() => undefined)
    }
    await connection?.close().catch(() => undefined)
  })

  it('declares isolated main, retry and dead-letter exchanges and queues', async () => {
    await Promise.all([
      channel.checkExchange(topology.exchange),
      channel.checkExchange(topology.retry.exchange),
      channel.checkExchange(topology.deadLetter.exchange),
      channel.checkQueue(topology.queue),
      channel.checkQueue(topology.retry.queue),
      channel.checkQueue(topology.deadLetter.queue),
    ])
  })

  it('redelivers a transient message through retry TTL and DLX before ack', async () => {
    const envelope = syntheticEnvelope('retry-once')
    const attempts: Array<{ readonly at: number; readonly retryCount: number }> = []
    let resolveRetry!: () => void
    const retried = new Promise<void>((resolve) => {
      resolveRetry = resolve
    })

    consumer = await provider.consume<SyntheticMessageEnvelopeV1>({
      prefetch: 1,
      decode: (value) => syntheticMessageEnvelopeV1Schema.parse(value),
      handler: (message) => {
        if (message.payload.eventId !== envelope.eventId) {
          return { type: 'ack' }
        }
        attempts.push({ at: Date.now(), retryCount: message.retryCount })
        if (attempts.length === 1) {
          return { type: 'retry' }
        }
        resolveRetry()
        return { type: 'ack' }
      },
    })

    await provider.publish(envelope)
    await Promise.race([
      retried,
      Bun.sleep(5_000).then(() => {
        throw new Error('retry delivery timed out')
      }),
    ])

    expect(attempts).toHaveLength(2)
    expect(attempts[1]!.retryCount).toBe(1)
    expect(attempts[1]!.at - attempts[0]!.at).toBeGreaterThanOrEqual(topology.retry.delayMs - 25)
    await consumer.cancel()
    consumer = undefined
  })

  it('routes a fatal message to the dead-letter queue', async () => {
    const envelope = syntheticEnvelope('fatal')
    consumer = await provider.consume<SyntheticMessageEnvelopeV1>({
      prefetch: 1,
      decode: (value) => syntheticMessageEnvelopeV1Schema.parse(value),
      handler: (message) =>
        message.payload.eventId === envelope.eventId ? { type: 'dead-letter' } : { type: 'ack' },
    })

    await provider.publish(envelope)
    const deadLetter = await waitFor(() => getMessage(channel, topology.deadLetter.queue))

    expect(JSON.parse(deadLetter.content.toString())).toEqual(envelope)
    expect(deadLetter.properties.headers?.['x-death']).toBeDefined()
    await consumer.cancel()
    consumer = undefined
  })
})
