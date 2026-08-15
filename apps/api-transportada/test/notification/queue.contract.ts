/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  RabbitMqConsumeParams,
  RabbitMqConsumer,
  RabbitMqPublishOptions,
} from '@adatechnology/rabbitmq-provider'
import type { NotificationJob } from '@adatechnology/notification-contracts'

import { buildNotificationRabbitMqTopology } from '../../src/notification/infrastructure/notification-rabbitmq-topology'
import {
  createLazyRabbitMqNotificationQueue,
  createRabbitMqNotificationQueue,
} from '../../src/notification/infrastructure/rabbitmq-notification-queue.adapter'

const QUEUE_PREFIX = 'transportada_test'

const JOB: NotificationJob = Object.freeze({
  attempt: 0,
  channel: 'email',
  companyId: '00000000-0000-4000-8000-000000000101',
  deliveryId: '00000000-0000-4000-8000-000000000201',
  notificationId: '00000000-0000-4000-8000-000000000301',
})

type PublishCall = {
  readonly options: RabbitMqPublishOptions | undefined
  readonly payload: unknown
}

function providerStub() {
  const published: PublishCall[] = []
  const consumed: RabbitMqConsumeParams<NotificationJob>[] = []
  let closed = false

  const provider = {
    async close() {
      closed = true
    },
    async consume<TPayload>(params: RabbitMqConsumeParams<TPayload>): Promise<RabbitMqConsumer> {
      consumed.push(params as unknown as RabbitMqConsumeParams<NotificationJob>)
      return { consumerTag: 'notification-consumer', async cancel() {} }
    },
    async healthCheck() {
      return { healthy: true } as const
    },
    async publish<TPayload>(payload: TPayload, options?: RabbitMqPublishOptions) {
      published.push({ options, payload })
    },
  }

  return { consumed, isClosed: () => closed, provider, published }
}

describe('contrato do nome das filas de notificação', () => {
  test('a trilha segue o padrão do monorepo', () => {
    const topology = buildNotificationRabbitMqTopology({ queuePrefix: QUEUE_PREFIX })

    expect(topology.exchange).toBe('transportada_test.notification.v1.main.exchange')
    expect(topology.queue).toBe('transportada_test.notification.v1.main.queue')
    expect(topology.routingKey).toBe('transportada_test.notification.v1.main')
    expect(topology.retry.exchange).toBe('transportada_test.notification.v1.retry.exchange')
    expect(topology.retry.queue).toBe('transportada_test.notification.v1.retry.queue')
    expect(topology.retry.routingKey).toBe('transportada_test.notification.v1.retry')
    expect(topology.deadLetter.exchange).toBe('transportada_test.notification.v1.dead.exchange')
    expect(topology.deadLetter.queue).toBe('transportada_test.notification.v1.dead.queue')
    expect(topology.deadLetter.routingKey).toBe('transportada_test.notification.v1.dead')
  })

  test('o prefixo é do ambiente, não literal', () => {
    const topology = buildNotificationRabbitMqTopology({ queuePrefix: 'outro_prefixo' })

    expect(topology.queue.startsWith('outro_prefixo.')).toBe(true)
  })
})

describe('contrato do adaptador de fila do módulo de notificações', () => {
  test('publica só a referência do job', async () => {
    const { provider, published } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.enqueue({ job: JOB })

    expect(published).toHaveLength(1)
    expect(published[0]?.payload).toEqual(JOB)
    // O corpo e o endereço ficam no banco: quem lê a fila não pode aprender nada sobre a pessoa.
    expect(Object.keys(published[0]?.payload as object).sort()).toEqual([
      'attempt',
      'channel',
      'companyId',
      'deliveryId',
      'notificationId',
    ])
  })

  test('a entrega identifica a mensagem, para o consumidor casar a tentativa', async () => {
    const { provider, published } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.enqueue({ job: JOB })

    expect(published[0]?.options?.messageId).toBe(JOB.deliveryId)
    expect(published[0]?.options?.correlationId).toBe(JOB.notificationId)
  })

  /**
   * Sem o plugin de mensagem atrasada o broker entrega na hora. O adaptador não finge que respeitou
   * o atraso: ele avisa, e é por isso que agendamento e backoff longo dependem do ciclo do cron.
   */
  test('o atraso que o broker não sabe cumprir é registrado, não engolido', async () => {
    const warnings: { readonly message: string; readonly meta?: unknown }[] = []
    const { provider, published } = providerStub()
    const queue = createRabbitMqNotificationQueue({
      logger: {
        warn(message, meta) {
          warnings.push({ message, ...(meta === undefined ? {} : { meta }) })
        },
      },
      provider,
    })

    await queue.enqueue({ delaySeconds: 900, job: JOB })

    expect(published).toHaveLength(1)
    expect(published[0]?.options?.headers).toEqual({ 'x-delay': 900_000 })
    expect(warnings.map(({ message }) => message)).toEqual([
      'notification.queue.delay_not_supported',
    ])
  })

  test('sem atraso não vai cabeçalho de atraso', async () => {
    const { provider, published } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.enqueue({ job: JOB })

    expect(published[0]?.options?.headers).toBeUndefined()
  })

  test('o job entregue ao handler é o que saiu na fila', async () => {
    const { consumed, provider } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })
    const handled: NotificationJob[] = []

    await queue.consume(async (job) => {
      handled.push(job)
    })

    const params = consumed[0]
    expect(params?.prefetch).toBeGreaterThan(0)
    expect(params?.decode(JOB)).toEqual(JOB)
    const disposition = await params?.handler({
      headers: {},
      payload: JOB,
      redelivered: false,
      retryCount: 0,
    })

    expect(handled).toEqual([JOB])
    expect(disposition).toEqual({ type: 'ack' })
  })

  test('handler que falha manda a mensagem para o trilho de retry', async () => {
    const { consumed, provider } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.consume(async () => {
      throw new Error('entrega falhou')
    })

    const disposition = await consumed[0]?.handler({
      headers: {},
      payload: JOB,
      redelivered: false,
      retryCount: 0,
    })

    expect(disposition).toEqual({ type: 'retry' })
  })

  /** Payload que não é job é veneno: repetir não conserta, e o lugar dele é a fila morta. */
  test('payload que não é job vai para a fila morta', async () => {
    const { consumed, provider } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.consume(async () => {})

    expect(() => consumed[0]?.decode({ notificationId: 'sem-o-resto' })).toThrow()
  })

  test('fechar o adaptador fecha a conexão', async () => {
    const { isClosed, provider } = providerStub()
    const queue = createRabbitMqNotificationQueue({ provider })

    await queue.close()

    expect(isClosed()).toBe(true)
  })
})

/**
 * O `bootstrap()` da API é síncrono e abrir conexão é assíncrono. Em vez de contaminar o boot
 * inteiro, a conexão é aberta na primeira entrega — e uma só vez.
 */
describe('contrato da conexão preguiçosa da fila', () => {
  test('conecta uma vez, mesmo com entregas concorrentes', async () => {
    const { provider, published } = providerStub()
    let connections = 0
    const queue = createLazyRabbitMqNotificationQueue({
      async connect() {
        connections += 1
        return provider
      },
    })

    await Promise.all([queue.enqueue({ job: JOB }), queue.enqueue({ job: JOB })])

    expect(connections).toBe(1)
    expect(published).toHaveLength(2)
  })

  test('fechar sem nunca ter entregado não abre conexão', async () => {
    const { provider } = providerStub()
    let connections = 0
    const queue = createLazyRabbitMqNotificationQueue({
      async connect() {
        connections += 1
        return provider
      },
    })

    await queue.close()

    expect(connections).toBe(0)
  })
})
