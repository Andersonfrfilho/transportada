/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NotificationModule, NotificationWorker } from '@adatechnology/notification-module'
import type { QueuePort } from '@adatechnology/notification-contracts'

import { startNotificationConsumer } from '../../src/runtime/notification-consumer.service.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

function silentLogger(): WorkerLogger {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  } as unknown as WorkerLogger
}

function workerStub() {
  const calls: string[] = []
  const worker: NotificationWorker = {
    async start() {
      calls.push('start')
    },
    async stop() {
      calls.push('stop')
    },
  }
  return { calls, worker }
}

const QUEUE: QueuePort = {
  async close() {},
  async consume() {},
  async enqueue() {},
}

const MODULE = {} as NotificationModule

describe('contrato do consumidor de notificações', () => {
  test('subir o consumidor liga o worker do módulo', async () => {
    const { calls, worker } = workerStub()

    await startNotificationConsumer({
      createWorker: () => worker,
      logger: silentLogger(),
      module: MODULE,
      queue: QUEUE,
    })

    expect(calls).toEqual(['start'])
  })

  // Encerramento gracioso: o `stop()` do módulo é o que devolve a entrega em voo para a fila, em
  // vez de deixá-la presa em `queued` até uma varredura achar.
  test('cancelar o consumidor para o worker do módulo', async () => {
    const { calls, worker } = workerStub()

    const consumer = await startNotificationConsumer({
      createWorker: () => worker,
      logger: silentLogger(),
      module: MODULE,
      queue: QUEUE,
    })
    await consumer.cancel()

    expect(calls).toEqual(['start', 'stop'])
  })

  test('a fila do módulo é a que o host injetou', async () => {
    const received: QueuePort[] = []
    const { worker } = workerStub()

    await startNotificationConsumer({
      createWorker: (params) => {
        received.push(params.queue)
        return worker
      },
      logger: silentLogger(),
      module: MODULE,
      queue: QUEUE,
    })

    expect(received).toEqual([QUEUE])
  })
})
