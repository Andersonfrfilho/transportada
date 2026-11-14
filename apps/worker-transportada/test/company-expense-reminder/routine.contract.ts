/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4 (CA14): a rotina dos lembretes de vencimento, com portas em memória.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  type CompanyExpenseReminderPorts,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderEmail,
  type ReminderOccurrence,
  type ReminderPerson,
  type ReminderSettings,
} from '../../src/company-expense-reminder/application/company-expense-reminder.port.js'
import {
  createCompanyExpenseReminderRoutine,
  saoPauloClock,
} from '../../src/company-expense-reminder/application/company-expense-reminder.routine.js'
import { COMPANY_EXPENSE_REMINDER_SEND_JOB } from '../../src/company-expense-reminder/domain/company-expense-reminder.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

/** 12:00 UTC = 09:00 em São Paulo, 10/11/2026. */
const NOW = new Date('2026-11-10T12:00:00.000Z')
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const RESPONSIBLE = '00000000-0000-4000-8000-0000000000e1'
const ADMIN = '00000000-0000-4000-8000-0000000000e3'

const NOOP = () => undefined
const LOGGER = { debug: NOOP, error: NOOP, info: NOOP, warn: NOOP }
const TEMPLATE = {
  body: '<p>{{conta}} {{situacao}} — {{valor}} ({{favorecido}})</p><!-- mensagem -->{{botaoAbrirContas}}',
  subject: '{{conta}} {{situacao}} — {{valor}}',
}

function context(): JobRoutineContext {
  return {
    correlationId: 'c',
    executionId: 'e',
    isStopRequested: () => false,
    job: COMPANY_EXPENSE_REMINDER_SEND_JOB,
    origin: 'schedule',
  }
}

function occurrence(overrides: Partial<ReminderOccurrence> & { id: string }): ReminderOccurrence {
  return {
    categoryName: 'Aluguel',
    companyId: A,
    competence: '2026-11',
    dueDate: '2026-11-13',
    expectedAmount: '1500.00',
    expenseName: 'Aluguel galpão',
    payeeName: null,
    responsibleUserId: RESPONSIBLE,
    ...overrides,
  }
}

const person = (
  userId: string,
  emailAddress: string | null = `${userId}@x.test`,
): ReminderPerson => ({
  channels: emailAddress === null ? [] : ['email'],
  emailAddress,
  name: userId === ADMIN ? 'Admin' : 'Responsável',
  userId,
})

type State = {
  emails: ReminderEmail[]
  failMail: boolean
  occurrences: ReminderOccurrence[]
  people: Map<string, ReminderPerson>
  sent: Set<string>
  settings: ReminderSettings
  template: { body: string; subject: string } | null
}

let state: State
const ports = (): CompanyExpenseReminderPorts => ({
  appBaseUrl: 'https://painel.example.test',
  companies: {
    displayName: async () => 'Transportadora Teste',
    listWithOpenOccurrences: async () => [...new Set(state.occurrences.map((o) => o.companyId))],
  },
  mailer: {
    send: async (email) => {
      if (state.failMail) throw new Error('provider down')
      state.emails.push(email)
    },
  },
  occurrences: {
    listOpen: async ({ companyId }) => state.occurrences.filter((o) => o.companyId === companyId),
  },
  people: {
    findAdmins: async () =>
      [state.people.get(ADMIN)].filter((p): p is ReminderPerson => p !== undefined),
    findById: async ({ userId }) => state.people.get(userId) ?? null,
  },
  sent: {
    record: async (key) => {
      const k = `${key.occurrenceId}|${key.recipientUserId}|${key.day}|${key.kind}`
      if (state.sent.has(k)) return false
      state.sent.add(k)
      return true
    },
    release: async (key) => {
      state.sent.delete(`${key.occurrenceId}|${key.recipientUserId}|${key.day}|${key.kind}`)
    },
  },
  settings: { get: async () => state.settings },
  templates: { findEmail: async () => state.template },
})

const run = (now = NOW) =>
  createCompanyExpenseReminderRoutine({ logger: LOGGER, now: () => now, ports: ports() }).run(
    context(),
  )

beforeEach(() => {
  state = {
    emails: [],
    failMail: false,
    occurrences: [],
    people: new Map([
      [RESPONSIBLE, person(RESPONSIBLE)],
      [ADMIN, person(ADMIN)],
    ]),
    sent: new Set(),
    settings: DEFAULT_REMINDER_SETTINGS,
    template: TEMPLATE,
  }
})

describe('rotina dos lembretes de vencimento (spec 325 T7.4)', () => {
  test('converte o relógio para o dia e a hora de São Paulo', () => {
    expect(saoPauloClock(new Date('2026-11-10T02:30:00.000Z'))).toEqual({
      hour: 23,
      today: '2026-11-09',
    })
    expect(saoPauloClock(NOW)).toEqual({ hour: 9, today: '2026-11-10' })
  })

  test('avisa o responsável 3 dias antes, uma vez, por e-mail renderizado', async () => {
    state.occurrences = [occurrence({ id: 'o1' })]
    const result = await run()
    expect(result.counters.sent).toBe(1)
    expect(state.emails).toHaveLength(1)
    expect(state.emails[0]?.to).toBe(`${RESPONSIBLE}@x.test`)
    expect(state.emails[0]?.subject).toBe('Aluguel galpão vence em 3 dias — R$ 1.500,00')
    expect(state.emails[0]?.html).toContain('https://painel.example.test/contas')
  })

  test('rodar duas vezes no mesmo dia não duplica', async () => {
    state.occurrences = [occurrence({ id: 'o1' }), occurrence({ id: 'o2', dueDate: '2026-11-10' })]
    await run()
    const second = await run()
    expect(state.emails).toHaveLength(2)
    expect(second.counters.skipped).toBe(2)
    expect(second.counters.sent).toBe(0)
  })

  test('antes da hora da empresa não avisa; a partir dela avisa', async () => {
    state.occurrences = [occurrence({ id: 'o1' })]
    await run(new Date('2026-11-10T10:00:00.000Z')) // 07:00 em São Paulo
    expect(state.emails).toHaveLength(0)
    await run()
    expect(state.emails).toHaveLength(1)
  })

  test('sem responsável, ou com responsável que saiu, o aviso vai ao administrador', async () => {
    state.occurrences = [
      occurrence({ id: 'o1', responsibleUserId: null }),
      occurrence({ id: 'o2', responsibleUserId: 'gone' }),
    ]
    await run()
    expect(state.emails.map((e) => e.to)).toEqual([`${ADMIN}@x.test`, `${ADMIN}@x.test`])
  })

  test('falha do provedor solta a reserva, conta a falha e a próxima rodada tenta de novo', async () => {
    state.occurrences = [occurrence({ id: 'o1' })]
    state.failMail = true
    const first = await run()
    expect(first.counters.failed).toBe(1)
    expect(state.sent.size).toBe(0)
    state.failMail = false
    const second = await run()
    expect(second.counters.sent).toBe(1)
  })

  test('sem modelo de e-mail utilizável não envia e conta', async () => {
    state.occurrences = [occurrence({ id: 'o1' })]
    state.template = null
    const result = await run()
    expect(result.counters.templateMissing).toBe(1)
    state.template = { body: '<script>x</script><!-- mensagem -->', subject: 's' }
    expect((await run()).counters.templateMissing).toBe(1)
    expect(state.emails).toHaveLength(0)
  })

  test('canais além do e-mail ainda não saem daqui e são contados', async () => {
    state.occurrences = [occurrence({ id: 'o1' })]
    state.settings = { ...DEFAULT_REMINDER_SETTINGS, enabledChannels: ['email', 'whatsapp'] }
    state.people.set(RESPONSIBLE, { ...person(RESPONSIBLE), channels: ['email', 'whatsapp'] })
    const result = await run()
    expect(result.counters.sent).toBe(1)
    expect(result.counters.unsupportedChannel).toBe(1)
  })

  test('uma empresa que falha não segura as outras, e o ciclo acusa no fim', async () => {
    state.occurrences = [occurrence({ id: 'o1', companyId: B }), occurrence({ id: 'o2' })]
    const base = ports()
    const broken: CompanyExpenseReminderPorts = {
      ...base,
      settings: {
        get: async ({ companyId }) => {
          if (companyId === A) throw new Error('boom')
          return state.settings
        },
      },
    }
    const routine = createCompanyExpenseReminderRoutine({
      logger: LOGGER,
      now: () => NOW,
      ports: broken,
    })
    await expect(routine.run(context())).rejects.toThrow('failed for 1 company')
    expect(state.emails).toHaveLength(1)
  })
})
