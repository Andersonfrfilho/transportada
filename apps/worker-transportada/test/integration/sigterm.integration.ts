/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import type { Subprocess } from 'bun'
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { connect, type Channel, type ChannelModel } from 'amqplib'

import type { SyntheticMessageEnvelopeV1 } from '../../src/messaging/message-envelope.schema.js'
import { buildRabbitMqTopology } from '../../src/messaging/rabbitmq-topology.js'

const databaseUrl = process.env.DATABASE_URL
const rabbitMqUrl = process.env.RABBITMQ_URL
const describeLocal = databaseUrl && rabbitMqUrl ? describe : describe.skip

/**
 * Subir um processo Bun novo enquanto Postgres, RabbitMQ e Keycloak disputam o mesmo runner passa
 * dos 5s do orçamento padrão. O teste mede o dreno no SIGTERM, não a velocidade do boot.
 */
const BOOT_TIMEOUT_MS = 20_000
const TEST_TIMEOUT_MS = 40_000
/** Cauda de log anexada à falha: o bastante para ver a exceção do boot, pouco para não afogar o CI. */
const OUTPUT_TAIL_LENGTH = 2_000

describeLocal('worker SIGTERM integration', () => {
  const queuePrefix = `transportada.local.sigterm.${crypto.randomUUID()}`
  const topology = buildRabbitMqTopology(`${queuePrefix}.synthetic.v1`)
  let probeConnection: ChannelModel | undefined
  let probeChannel: Channel | undefined

  afterAll(async () => {
    if (!probeChannel || !probeConnection) {
      return
    }
    for (const queue of [topology.queue, topology.retry.queue, topology.deadLetter.queue]) {
      await probeChannel.deleteQueue(queue).catch(() => undefined)
    }
    for (const exchange of [
      topology.exchange,
      topology.retry.exchange,
      topology.deadLetter.exchange,
    ]) {
      await probeChannel.deleteExchange(exchange).catch(() => undefined)
    }
    await probeChannel.close().catch(() => undefined)
    await probeConnection.close().catch(() => undefined)
  })

  test(
    'drains an in-flight synthetic effect before exiting on SIGTERM',
    async () => {
      const port = 54_000 + Math.floor(Math.random() * 1_000)
      const worker = Bun.spawn(['bun', 'src/main.ts'], {
        cwd: new URL('../..', import.meta.url).pathname,
        env: {
          ...process.env,
          APP_ENV: 'test',
          DATABASE_URL: databaseUrl!,
          FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'true',
          FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS: '600',
          LOG_LEVEL: 'info',
          QUEUE_PREFIX: queuePrefix,
          RABBITMQ_URL: rabbitMqUrl!,
          WORKER_PORT: String(port),
        },
        stderr: 'pipe',
        stdout: 'pipe',
      })
      const output = collectOutput(worker.stdout)
      const errors = collectOutput(worker.stderr)

      try {
        await waitForBoot({ errors, output, port, worker })

        const publisher = await createRabbitMqProvider({
          connection: rabbitMqUrl!,
          topology,
        })
        const envelope: SyntheticMessageEnvelopeV1 = {
          companyId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          payload: { operation: 'contract-test' },
          type: 'transportada.synthetic',
          version: 1,
        }
        await publisher.publish(envelope)
        await waitFor(async () =>
          (await output.read()).includes('foundation_synthetic_effect_started'),
        )

        const shutdownStartedAt = performance.now()
        worker.kill('SIGTERM')
        const exitCode = await worker.exited
        const shutdownDurationMs = performance.now() - shutdownStartedAt

        expect(exitCode).toBe(0)
        expect(shutdownDurationMs).toBeGreaterThanOrEqual(350)
        await publisher.close()

        probeConnection = await connect(rabbitMqUrl!)
        probeChannel = await probeConnection.createChannel()
        expect((await probeChannel.checkQueue(topology.queue)).messageCount).toBe(0)
      } finally {
        if (worker.exitCode === null) {
          worker.kill('SIGKILL')
          await worker.exited
        }
        const stderr = await errors.read()
        expect(stderr).not.toContain('secret')
      }
    },
    TEST_TIMEOUT_MS,
  )
})

type OutputCollector = {
  read(): Promise<string>
  completion: Promise<void>
}

function collectOutput(stream: ReadableStream<Uint8Array>): OutputCollector {
  let value = ''
  const completion = (async () => {
    for await (const chunk of stream) {
      value += new TextDecoder().decode(chunk)
    }
  })()

  return {
    async read(): Promise<string> {
      await Bun.sleep(0)
      return value
    },
    completion,
  }
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition timed out after ${timeoutMs}ms`)
    }
    await Bun.sleep(25)
  }
}

type BootWaitParams = {
  readonly errors: OutputCollector
  readonly output: OutputCollector
  readonly port: number
  readonly worker: Subprocess
}

/**
 * Esperar o relógio inteiro por um processo que já morreu produz sempre a mesma frase — "Condition
 * timed out after 20000ms" — para duas causas opostas: boot lento e boot que explodiu no primeiro
 * segundo. Foi assim que a resposta anterior a esta falha foi subir o orçamento de 5s para 20s, sem
 * nenhuma evidência de que o tempo fosse o problema. O processo morto encerra a espera na hora, e a
 * saída dele vai junto da falha nos dois caminhos.
 */
async function waitForBoot({ errors, output, port, worker }: BootWaitParams): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS

  while (true) {
    const response = await fetch(`http://127.0.0.1:${port}/health/live`).catch(() => undefined)
    if (response?.status === 200) {
      return
    }
    if (worker.exitCode !== null || worker.signalCode !== null) {
      throw new Error(
        `worker morreu durante o boot (exit ${String(worker.exitCode)}, sinal ${String(
          worker.signalCode,
        )})${await describeOutput({ errors, output })}`,
      )
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `worker não respondeu /health/live em ${BOOT_TIMEOUT_MS}ms${await describeOutput({
          errors,
          output,
        })}`,
      )
    }
    await Bun.sleep(25)
  }
}

async function describeOutput({
  errors,
  output,
}: Pick<BootWaitParams, 'errors' | 'output'>): Promise<string> {
  const tailOf = (value: string): string =>
    value.length > OUTPUT_TAIL_LENGTH ? value.slice(-OUTPUT_TAIL_LENGTH) : value

  return `\n--- stdout ---\n${tailOf(await output.read())}\n--- stderr ---\n${tailOf(
    await errors.read(),
  )}`
}
