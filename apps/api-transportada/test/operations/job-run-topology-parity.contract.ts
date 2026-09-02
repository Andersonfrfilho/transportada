/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  JOB_RUN_EVENT_TYPE,
  JOB_RUN_QUEUE_ROUTE,
  buildJobRunRabbitMqTopology,
} from '../../src/operations/infrastructure/job-run-rabbitmq-topology.js'

/**
 * ⚠️ A topologia do `job-run` existe em **três** apps que não importam código uma da outra: o cron
 * publica pela batida, a API publica pelo botão (spec 072) e o worker consome. Fila é acordo de
 * nome: uma letra de diferença faz o publicador criar a sua e o consumidor esperar para sempre na
 * outra — sem erro, sem log, só silêncio.
 *
 * Comparar contra o **arquivo do worker** é de propósito: ele é quem consome, e é o nome dele que
 * manda.
 */
const WORKER_TOPOLOGY = new URL(
  '../../../worker-transportada/src/messaging/job-run-rabbitmq-topology.ts',
  import.meta.url,
)
const WORKER_ENVELOPE = new URL(
  '../../../worker-transportada/src/messaging/job-run-envelope.schema.ts',
  import.meta.url,
)

describe('paridade da topologia de job-run (spec 072)', () => {
  test('nomeia exchange, fila e chave como o worker nomeia', async () => {
    const source = await readFile(WORKER_TOPOLOGY, 'utf8')
    const topology = buildJobRunRabbitMqTopology({ queuePrefix: 'prefixo' })

    /** O worker monta os nomes a partir do mesmo prefixo de rota; se a forma mudar lá, cai aqui. */
    for (const suffix of ['main.exchange', 'main.queue', 'retry.queue', 'dead.queue']) {
      expect(source).toContain(`\${routePrefix}.${suffix}`)
    }
    expect(topology.queue).toBe(`prefixo.${JOB_RUN_QUEUE_ROUTE}.main.queue`)
    expect(topology.exchange).toBe(`prefixo.${JOB_RUN_QUEUE_ROUTE}.main.exchange`)
    expect(topology.retry?.maxRetries).toBe(3)
  })

  test('usa a mesma rota e o mesmo tipo de evento que o worker declara', async () => {
    const envelope = await readFile(WORKER_ENVELOPE, 'utf8')

    expect(envelope).toContain(`JOB_RUN_QUEUE_ROUTE = '${JOB_RUN_QUEUE_ROUTE}'`)
    expect(envelope).toContain(`JOB_RUN_EVENT_TYPE = '${JOB_RUN_EVENT_TYPE}'`)
  })
})
