/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  PendingPickupNotification,
  PickupRequestNotifyPorts,
} from '../../src/pickup-request-notify/application/pickup-request-notify.port.js'
import {
  createPickupRequestNotifyRoutine,
  retryDelayMinutes,
} from '../../src/pickup-request-notify/application/pickup-request-notify.routine.js'
import { buildPickupNotificationMessage } from '../../src/pickup-request-notify/domain/pickup-request-notify-message.policy.js'

const logger = { error() {}, info() {}, warn() {} } as never
const context = {
  correlationId: 'c',
  executionId: 'e',
  isStopRequested: () => false,
} as never

const request = {
  cargoDescription: '10 caixas',
  decisionNote: null,
  destinationCity: 'Campinas',
  id: 'r1',
  kind: 'pickup' as const,
  originCity: 'Ribeirão Preto',
  requesterEmail: 'cliente@example.com' as string | null,
  requesterName: 'Cliente Ltda',
  requesterPhone: '5516999999999' as string | null,
  windowEnd: '2026-11-20',
  windowStart: '2026-11-18',
}

function notification(
  overrides: Omit<Partial<PendingPickupNotification>, 'request'> & {
    request?: Partial<typeof request>
  } = {},
): PendingPickupNotification {
  return {
    attempts: 1,
    audience: 'client',
    channel: 'email',
    companyId: 'co',
    event: 'accepted',
    id: 'n1',
    ...overrides,
    request: { ...request, ...overrides.request },
  }
}

function harness(
  queue: PendingPickupNotification[],
  failures: { email?: boolean; whatsapp?: boolean } = {},
) {
  const calls = {
    emails: [] as { subject: string; to: readonly string[] }[],
    failed: [] as string[],
    retried: [] as { availableAt: Date; id: string }[],
    sent: [] as string[],
    skipped: [] as string[],
    whatsapps: [] as string[],
  }
  let claimed = false
  const ports: PickupRequestNotifyPorts = {
    delivery: {
      email: async (input) => {
        if (failures.email === true) throw new Error('resend_down')
        calls.emails.push({ subject: input.subject, to: input.to })
      },
      officeEmails: async () => ['admin@example.com'],
      whatsapp: async (input) => {
        if (failures.whatsapp === true) throw new Error('evolution_down')
        calls.whatsapps.push(input.number)
      },
    },
    links: { office: 'https://painel.example.com', portal: null },
    outbox: {
      claim: async () => {
        if (claimed) return []
        claimed = true
        return queue
      },
      markFailed: async ({ id }) => void calls.failed.push(id),
      markRetry: async ({ availableAt, id }) => void calls.retried.push({ availableAt, id }),
      markSent: async ({ id }) => void calls.sent.push(id),
      markSkipped: async ({ id }) => void calls.skipped.push(id),
    },
    sweep: { expireDue: async () => 2, markStale: async () => 1 },
  }
  const now = new Date('2026-11-15T12:00:00Z')
  const routine = createPickupRequestNotifyRoutine({ logger, now: () => now, ports })
  return { calls, now, routine }
}

describe('rotina pickup-request.notify (spec 339 T4)', () => {
  test('entrega e-mail e WhatsApp ao cliente e marca como enviado, contando a varredura', async () => {
    const { calls, routine } = harness([
      notification(),
      notification({ channel: 'whatsapp', id: 'n2' }),
    ])
    const result = await routine.run(context)
    expect(result.counters).toMatchObject({ expired: 2, sent: 2, stale: 1 })
    expect(calls.emails).toEqual([
      { subject: 'Pedido de coleta aceito', to: ['cliente@example.com'] },
    ])
    expect(calls.whatsapps).toEqual(['5516999999999'])
    expect(calls.sent).toEqual(['n1', 'n2'])
  })

  test('aviso ao escritório vai aos e-mails do escritório', async () => {
    const { calls, routine } = harness([notification({ audience: 'office', event: 'requested' })])
    await routine.run(context)
    expect(calls.emails[0]?.to).toEqual(['admin@example.com'])
    expect(calls.emails[0]?.subject).toBe('Novo pedido de coleta: Cliente Ltda')
  })

  test('sem contato o aviso é pulado, não repetido para sempre', async () => {
    const { calls, routine } = harness([
      notification({ request: { requesterEmail: null } }),
      notification({ channel: 'whatsapp', id: 'n2', request: { requesterPhone: null } }),
    ])
    const result = await routine.run(context)
    expect(calls.skipped).toEqual(['n1', 'n2'])
    expect(result.counters).toMatchObject({ skipped: 2, sent: 0 })
  })

  test('falha do provedor reagenda com espera crescente e desiste no teto', async () => {
    const retrying = harness([notification({ attempts: 2 })], { email: true })
    await retrying.routine.run(context)
    expect(retrying.calls.retried).toHaveLength(1)
    expect(retrying.calls.retried[0]?.availableAt.getTime()).toBe(
      retrying.now.getTime() + retryDelayMinutes(2) * 60_000,
    )
    expect(retrying.calls.sent).toEqual([])

    const giving = harness([notification({ attempts: 5 })], { email: true })
    await giving.routine.run(context)
    expect(giving.calls.failed).toEqual(['n1'])
    expect(giving.calls.retried).toEqual([])
  })

  test('a espera cresce e a última faixa se repete', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMinutes)).toEqual([2, 10, 30, 120, 480, 480])
  })

  test('o texto traz janela, carga e o motivo da recusa', () => {
    const message = buildPickupNotificationMessage({
      audience: 'client',
      event: 'refused',
      link: null,
      request: { ...request, decisionNote: 'Fora da nossa região' },
    })
    expect(message.subject).toBe('Pedido de coleta não aceito')
    expect(message.body).toContain('entre 18/11/2026 e 20/11/2026')
    expect(message.body).toContain('Motivo/observação: Fora da nossa região')
  })
})
