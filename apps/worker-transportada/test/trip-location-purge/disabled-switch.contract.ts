/**
 * Spec 196 + 239: o expurgo nasce **desligado** — quem liga é a empresa, na tela. Sem empresa elegível
 * tem de significar "não leu, não contou, não apagou": uma rotina que só deixa de achar linha venceria
 * este contrato sem estar desligada, e apagar coordenada é irreversível. O contrato conta **chamadas**.
 */
import { describe, expect, test } from 'bun:test'

import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import { parseWorkerEnvironment } from '../../src/config/environment.schema.js'

const CONTEXT = {
  correlationId: 'disabled-switch-contract',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge' as const,
  origin: 'schedule' as const,
}

const DISABLED_MESSAGE = 'trip_location_purge_disabled'
const PINGS_FINISHED_MESSAGE = 'trip_location_purge_pings_finished'
const CYCLE_FINISHED_MESSAGE = 'trip_location_purge_cycle_finished'

type Call = { readonly message: string; readonly metadata: Record<string, unknown> }

/** O mínimo que o boot aceita, no molde de `test/environment.contract.test.ts`. */
const MINIMAL_ENVIRONMENT = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

type RoutineSetup = {
  readonly companies: number | Error
}

function buildRoutine(setup: RoutineSetup) {
  const logs: Call[] = []
  const calls: string[] = []
  const countedAt: Date[] = []
  const redactedAt: Date[] = []
  const countingRedactor = (name: string) => {
    let isFirstCall = true
    return async (input: { readonly now: Date }) => {
      calls.push(name)
      if (name !== 'purgeStalePings') redactedAt.push(input.now)
      if (!isFirstCall) return 0
      isFirstCall = false
      return 1
    }
  }

  const routine = createTripLocationPurgeRoutine({
    countEligibleCompanies: async ({ now }) => {
      calls.push('countEligibleCompanies')
      countedAt.push(now)
      if (setup.companies instanceof Error) throw setup.companies
      return setup.companies
    },
    logger: {
      error: () => undefined,
      info: (message: string, metadata?: Record<string, unknown>) => {
        logs.push({ message, metadata: metadata ?? {} })
      },
      warn: () => undefined,
    },
    now: () => new Date('2026-09-30T09:00:00.000Z'),
    purgeStalePings: async () => {
      calls.push('purgeStalePings')
      return calls.filter((name) => name === 'purgeStalePings').length === 1 ? 1 : 0
    },
    redact: countingRedactor('redact'),
    redactDocumentOccurrenceLocations: countingRedactor('redactDocumentOccurrenceLocations'),
    redactProofLocations: countingRedactor('redactProofLocations'),
    redactStatusEventLocations: countingRedactor('redactStatusEventLocations'),
    redactStopOccurrenceLocations: countingRedactor('redactStopOccurrenceLocations'),
  })

  return { calls, countedAt, logs, redactedAt, routine }
}

describe('sem empresa elegível o expurgo não toca as cinco tabelas (spec 239 D3)', () => {
  test('nenhuma empresa elegível: nenhum redator é chamado; o rastro ao vivo e a contagem rodam', async () => {
    const { calls, routine } = buildRoutine({ companies: 0 })

    await routine.run(CONTEXT)

    expect([...new Set(calls)]).toEqual(['purgeStalePings', 'countEligibleCompanies'])
  })

  test('nenhuma empresa elegível: o ciclo fecha succeeded, sem redigir tabela de evento, e conta os pings', async () => {
    const { routine } = buildRoutine({ companies: 0 })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({
      batches: 0,
      purgedPings: 1,
      redacted: 0,
      redactedProofs: 0,
    })
  })

  test('nenhuma empresa elegível: o log diz que foi de propósito, com a contagem e sem prazo', async () => {
    const { logs, routine } = buildRoutine({ companies: 0 })

    await routine.run(CONTEXT)

    expect(logs.map((entry) => entry.message)).toEqual([PINGS_FINISHED_MESSAGE, DISABLED_MESSAGE])
    const disabled = logs.find((entry) => entry.message === DISABLED_MESSAGE)
    expect(disabled?.metadata.companies).toBe(0)
    expect(disabled?.metadata).not.toHaveProperty('retentionDays')
  })

  test('com empresa elegível: pings, contagem e então os cinco redatores, todos no mesmo instante', async () => {
    const { calls, countedAt, logs, redactedAt, routine } = buildRoutine({ companies: 2 })

    await routine.run(CONTEXT)

    const order = [...new Set(calls)]
    expect(order.slice(0, 2)).toEqual(['purgeStalePings', 'countEligibleCompanies'])
    expect(order.slice(2).toSorted()).toEqual([
      'redact',
      'redactDocumentOccurrenceLocations',
      'redactProofLocations',
      'redactStatusEventLocations',
      'redactStopOccurrenceLocations',
    ])
    expect(new Set([...countedAt, ...redactedAt].map((date) => date.toISOString()))).toEqual(
      new Set(['2026-09-30T09:00:00.000Z']),
    )
    expect(logs.map((entry) => entry.message)).toContain(CYCLE_FINISHED_MESSAGE)
    expect(logs.map((entry) => entry.message)).not.toContain(DISABLED_MESSAGE)
  })

  test('o log do ciclo conta as empresas e não carrega prazo nem id de empresa', async () => {
    const { logs, routine } = buildRoutine({ companies: 3 })

    await routine.run(CONTEXT)

    const cycle = logs.find((entry) => entry.message === CYCLE_FINISHED_MESSAGE)
    expect(cycle?.metadata.companies).toBe(3)
    expect(cycle?.metadata).not.toHaveProperty('retentionDays')
    expect(cycle?.metadata).not.toHaveProperty('companyId')
  })

  /** Tabela de configuração ausente (deploy fora de ordem): o ciclo falha inteiro, os pings já rodaram. */
  test('a contagem que lança falha o ciclo: pings rodaram, nenhum redator foi chamado', async () => {
    const { calls, routine } = buildRoutine({ companies: new Error('relation does not exist') })

    await expect(routine.run(CONTEXT)).rejects.toThrow()

    expect([...new Set(calls)]).toEqual(['purgeStalePings', 'countEligibleCompanies'])
  })

  test('a contagem que lança deixa no log os pings já apagados, sem dado pessoal', async () => {
    const { logs, routine } = buildRoutine({ companies: new Error('relation does not exist') })

    await expect(routine.run(CONTEXT)).rejects.toThrow()

    expect(logs).toEqual([
      {
        message: PINGS_FINISHED_MESSAGE,
        metadata: {
          correlationId: CONTEXT.correlationId,
          executionId: CONTEXT.executionId,
          pingBatches: 1,
          purgedPings: 1,
        },
      },
    ])
  })

  /**
   * Spec 239 D3: a variável saiu. Uma que sobrar no Railway não pode derrubar o boot (o schema não é
   * `.strict()`) nem voltar a decidir nada: quem liga é a empresa, na tela.
   */
  test('a chave que sobrou no ambiente é ignorada: não derruba o boot e não vira configuração', () => {
    for (const value of ['true', 'false', '1']) {
      const config = parseWorkerEnvironment({
        ...MINIMAL_ENVIRONMENT,
        TRIP_LOCATION_PURGE_ENABLED: value,
      })

      expect(config).not.toHaveProperty('tripLocationPurgeEnabled')
      expect(JSON.stringify(config)).not.toContain('PURGE_ENABLED')
    }
  })
})
