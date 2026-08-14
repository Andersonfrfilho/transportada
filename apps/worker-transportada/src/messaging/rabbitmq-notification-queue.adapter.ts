/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NotificationJob, QueuePort } from '@adatechnology/notification-contracts'
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { NOTIFICATION_QUEUE_PREFETCH } from '../notification/notification.constant.js'

type NotificationQueueLogger = {
  warn(message: string, meta?: Record<string, unknown>): void
}

type CreateRabbitMqNotificationQueueParams = {
  readonly logger?: NotificationQueueLogger
  readonly provider: RabbitMqProvider
}

const MILLISECONDS_PER_SECOND = 1_000

function decodeNotificationJob(value: unknown): NotificationJob {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('notification job payload is not an object')
  }

  const candidate = value as Record<string, unknown>
  const isJob =
    typeof candidate.notificationId === 'string' &&
    typeof candidate.deliveryId === 'string' &&
    typeof candidate.companyId === 'string' &&
    typeof candidate.channel === 'string' &&
    typeof candidate.attempt === 'number'

  if (!isJob) throw new TypeError('notification job payload is missing required references')

  return {
    attempt: candidate.attempt as number,
    channel: candidate.channel as NotificationJob['channel'],
    companyId: candidate.companyId as NotificationJob['companyId'],
    deliveryId: candidate.deliveryId as string,
    notificationId: candidate.notificationId as NotificationJob['notificationId'],
  }
}

type CreateLazyRabbitMqNotificationQueueParams = {
  readonly connect: () => Promise<RabbitMqProvider>
  readonly logger?: NotificationQueueLogger
}

/**
 * O job já é só referência (`notificationId`, `deliveryId`, `companyId`) — publica-se como veio, sem
 * enriquecer: conteúdo e endereço ficam no banco, e a fila não pode ensinar nada sobre a pessoa.
 */
export function createRabbitMqNotificationQueue(
  params: CreateRabbitMqNotificationQueueParams,
): QueuePort {
  return {
    async close() {
      await params.provider.close()
    },

    async consume(handler) {
      await params.provider.consume<NotificationJob>({
        decode: decodeNotificationJob,
        async handler(message) {
          try {
            await handler(message.payload)
            return { type: 'ack' }
          } catch {
            // O erro concreto é do módulo, que já o registra na entrega; aqui só se decide o trilho.
            return { type: 'retry' }
          }
        },
        prefetch: NOTIFICATION_QUEUE_PREFETCH,
      })
    },

    async enqueue({ delaySeconds, job }) {
      const options = {
        correlationId: job.notificationId,
        messageId: job.deliveryId,
        ...(delaySeconds === undefined
          ? {}
          : { headers: { 'x-delay': delaySeconds * MILLISECONDS_PER_SECOND } }),
      }

      if (delaySeconds !== undefined) {
        // O `x-delay` só é obedecido com o plugin de mensagem atrasada; sem ele o broker entrega na
        // hora. Avisar é o que impede que um agendamento silenciosamente vire entrega imediata.
        params.logger?.warn('notification.queue.delay_not_supported', {
          delaySeconds,
          deliveryId: job.deliveryId,
        })
      }

      await params.provider.publish(job, options)
    },
  }
}

/**
 * O `bootstrap()` da API é síncrono; abrir conexão não é. A conexão nasce na primeira entrega, e a
 * promessa memorizada é o que impede duas entregas simultâneas abrirem dois canais.
 */
export function createLazyRabbitMqNotificationQueue(
  params: CreateLazyRabbitMqNotificationQueueParams,
): QueuePort {
  let connected: Promise<QueuePort> | undefined

  function resolveQueue(): Promise<QueuePort> {
    connected ??= params.connect().then((provider) =>
      createRabbitMqNotificationQueue({
        provider,
        ...(params.logger === undefined ? {} : { logger: params.logger }),
      }),
    )
    return connected
  }

  return {
    async close() {
      if (connected === undefined) return
      await (await connected).close()
    },
    async consume(handler) {
      await (await resolveQueue()).consume(handler)
    },
    async enqueue(enqueueParams) {
      await (await resolveQueue()).enqueue(enqueueParams)
    },
  }
}
