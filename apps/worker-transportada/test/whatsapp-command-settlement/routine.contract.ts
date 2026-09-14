/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — a rotina `whatsapp.command.settle`. Ela não fatura nem decide: varre, chama a API
 * com o veredito como dica, e entrega o resumo que a API devolveu ao número de quem confirmou.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createWhatsAppCommandSettlementRoutine } from '../../src/whatsapp-command-settlement/application/whatsapp-command-settlement.routine.js'
import type {
  SettlementCandidate,
  SettlementApiResult,
} from '../../src/whatsapp-command-settlement/application/whatsapp-command-settlement.port.js'

const NOW = new Date('2026-09-12T12:00:00.000Z')
const MINUTE_MS = 60_000
const COMPANY_A = '00000000-0000-4000-8000-000000001701'
const COMPANY_B = '00000000-0000-4000-8000-000000001702'
const ACTOR = '00000000-0000-4000-8000-000000001703'
const PHONE = '5516999991234'
const SUMMARY = 'Resultado do pedido 00000000:\n❌ NF-e 1201: 539 — Rejeicao: Duplicidade'

const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * MINUTE_MS)

function candidate(id: string, overrides: Partial<SettlementCandidate> = {}): SettlementCandidate {
  return {
    actorUserId: ACTOR,
    companyId: COMPANY_A,
    confirmedAt: minutesAgo(30),
    documents: ['success'],
    id,
    status: 'dispatched',
    ...overrides,
  }
}

function context(overrides: Partial<JobRoutineContext> = {}): JobRoutineContext {
  return {
    correlationId: 'corr-t014-routine',
    executionId: '00000000-0000-4000-8000-000000001799',
    isStopRequested: () => false,
    job: 'whatsapp.command.settle',
    origin: 'schedule',
    ...overrides,
  }
}

function createScenario(options: {
  readonly apiFailsFor?: readonly string[]
  readonly candidates: readonly SettlementCandidate[]
  readonly phone?: string | undefined
  readonly recipients?: (input: {
    readonly userId: string
    readonly verifiedSince: Date
  }) => Promise<string | undefined>
  readonly result?: SettlementApiResult
  readonly sendFails?: boolean
}) {
  const calls: Record<string, string>[] = []
  const listed: Record<string, unknown>[] = []
  const sent: Record<string, string>[] = []
  const logs: unknown[] = []
  const routine = createWhatsAppCommandSettlementRoutine({
    api: {
      async settle(input) {
        calls.push(input)
        if (options.apiFailsFor?.includes(input.requestId)) throw new Error('api_down:503')
        return options.result ?? { message: undefined, outcome: 'waiting' }
      },
    },
    candidates: {
      async listCandidates(input) {
        listed.push(input)
        return options.candidates
      },
    },
    logger: {
      error: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
    },
    now: () => NOW,
    recipients: {
      async findVerifiedPhone(input) {
        if (options.recipients !== undefined) return options.recipients(input)
        return 'phone' in options ? options.phone : PHONE
      },
    },
    sender: {
      async sendText(input) {
        sent.push(input)
        if (options.sendFails === true) throw new Error('(#131047) Re-engagement message')
      },
    },
  })
  return { calls, listed, logs, routine, sent }
}

describe('rotina whatsapp.command.settle (spec 144 T014)', () => {
  test('pede à fonte os dispatched e os confirming parados antes de quinze minutos', async () => {
    const scenario = createScenario({ candidates: [] })
    await scenario.routine.run(context())
    expect(scenario.listed).toEqual([
      { limit: 200, now: NOW, stuckConfirmingBefore: minutesAgo(15) },
    ])
  })

  test('chama a API só com os pedidos a liquidar ou retomar, cada um na sua empresa', async () => {
    const scenario = createScenario({
      candidates: [
        candidate('final', { documents: ['success', 'failure'] }),
        candidate('pending-fresh', { documents: ['success', 'pending'] }),
        candidate('pending-old', {
          companyId: COMPANY_B,
          confirmedAt: minutesAgo(121),
          documents: ['pending'],
        }),
        candidate('stuck', { confirmedAt: minutesAgo(20), documents: [], status: 'confirming' }),
        candidate('confirming-fresh', {
          confirmedAt: minutesAgo(2),
          documents: [],
          status: 'confirming',
        }),
      ],
    })

    const result = await scenario.routine.run(context())

    expect(scenario.calls).toEqual([
      { companyId: COMPANY_A, hint: 'settle', requestId: 'final' },
      { companyId: COMPANY_B, hint: 'settle_partial', requestId: 'pending-old' },
      { companyId: COMPANY_A, hint: 'resume', requestId: 'stuck' },
    ])
    expect(result).toEqual({
      counters: {
        candidates: 5,
        failed: 0,
        requested: 3,
        summariesSent: 0,
        summariesUndelivered: 0,
        summariesWithoutPhone: 0,
        waiting: 2,
      },
      outcome: 'succeeded',
    })
  })

  test('o resumo que a API devolveu vai ao número verificado de quem confirmou', async () => {
    const scenario = createScenario({
      candidates: [candidate('final')],
      result: { message: SUMMARY, outcome: 'settled' },
    })

    const result = await scenario.routine.run(context())

    expect(scenario.sent).toEqual([{ body: SUMMARY, companyId: COMPANY_A, to: PHONE }])
    expect(result.counters.summariesSent).toBe(1)
  })

  test('sem número vinculado o resumo não sai, e a liquidação já está feita', async () => {
    const scenario = createScenario({
      candidates: [candidate('final')],
      phone: undefined,
      result: { message: SUMMARY, outcome: 'settled' },
    })

    const result = await scenario.routine.run(context())

    expect(scenario.sent).toEqual([])
    expect(result.counters.summariesWithoutPhone).toBe(1)
    expect(result.outcome).toBe('succeeded')
  })

  /** T014b (M2): o número tem de ter sido verificado há no máximo 90 dias (spec 144 D1). */
  test('pede o número verificado dentro da validade de 90 dias', async () => {
    const asked: unknown[] = []
    const scenario = createScenario({
      candidates: [candidate('final')],
      recipients: async (input) => {
        asked.push(input)
        return PHONE
      },
      result: { message: SUMMARY, outcome: 'settled' },
    })

    await scenario.routine.run(context())

    expect(asked).toEqual([
      { userId: ACTOR, verifiedSince: new Date(NOW.getTime() - 90 * 86_400_000) },
    ])
  })

  test('número com verificação vencida: o resumo não sai, conta, e o log não leva o telefone', async () => {
    const verifiedAt = new Date(NOW.getTime() - 91 * 86_400_000)
    const scenario = createScenario({
      candidates: [candidate('final')],
      recipients: async (input) => (verifiedAt >= input.verifiedSince ? PHONE : undefined),
      result: { message: SUMMARY, outcome: 'settled' },
    })

    const result = await scenario.routine.run(context())

    expect(scenario.sent).toEqual([])
    expect(result.counters.summariesWithoutPhone).toBe(1)
    const logged = JSON.stringify(scenario.logs)
    expect(logged).toContain('whatsapp_command_settlement_summary_without_phone')
    expect(logged).not.toContain(PHONE)
    expect(logged).not.toContain(SUMMARY)
  })

  test('a API sem resumo (ator sem acesso): nada é enviado e o número nem é procurado', async () => {
    let asked = 0
    const scenario = createScenario({
      candidates: [candidate('final')],
      recipients: async () => {
        asked += 1
        return PHONE
      },
      result: { message: undefined, outcome: 'settled' },
    })

    const result = await scenario.routine.run(context())

    expect(scenario.sent).toEqual([])
    expect(asked).toBe(0)
    expect(result.counters.summariesWithoutPhone).toBe(0)
  })

  /** Janela de 24 h fechada: não se força template, fica registrado e a rotina segue. */
  test('a Meta recusando o texto livre não derruba a rotina nem vira falha do ciclo', async () => {
    const scenario = createScenario({
      candidates: [candidate('first'), candidate('second')],
      result: { message: SUMMARY, outcome: 'settled' },
      sendFails: true,
    })

    const result = await scenario.routine.run(context())

    expect(scenario.calls).toHaveLength(2)
    expect(result.counters.summariesUndelivered).toBe(2)
    expect(result.outcome).toBe('succeeded')
  })

  test('API fora do ar num pedido não impede os outros; o ciclo fecha com a falha nomeada', async () => {
    const scenario = createScenario({
      apiFailsFor: ['first'],
      candidates: [candidate('first'), candidate('second')],
    })

    const result = await scenario.routine.run(context())

    expect(scenario.calls.map((call) => call.requestId)).toEqual(['first', 'second'])
    expect(result.counters.failed).toBe(1)
    expect(result.outcome).toBe('settlement_request_failed')
  })

  test('parada pedida é lida entre pedidos: o que já foi chamado fica, o resto espera', async () => {
    let calls = 0
    const scenario = createScenario({ candidates: [candidate('first'), candidate('second')] })
    await scenario.routine.run(
      context({
        isStopRequested: () => {
          calls += 1
          return calls > 1
        },
      }),
    )
    expect(scenario.calls.map((call) => call.requestId)).toEqual(['first'])
  })

  test('o log nunca carrega o resumo, o telefone nem o motivo da Meta', async () => {
    const scenario = createScenario({
      candidates: [candidate('final')],
      result: { message: SUMMARY, outcome: 'settled' },
      sendFails: true,
    })

    await scenario.routine.run(context())

    const logged = JSON.stringify(scenario.logs)
    expect(scenario.logs.length).toBeGreaterThan(0)
    for (const secret of [SUMMARY, PHONE, '1201', 'Re-engagement']) {
      expect(logged).not.toContain(secret)
    }
  })
})
