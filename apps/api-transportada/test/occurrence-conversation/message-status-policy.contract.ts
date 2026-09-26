/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T402 (RF14, D7): a política de status da mensagem enviada, por tabela. Cada canal mostra
 * a confirmação que consegue dar — e só ela —, o estado só avança, cada transição guarda o horário,
 * e o evento repetido do provedor não muda nada.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyMessageStatus,
  initialOutboundStatus,
  type MessageStatusState,
} from '../../src/occurrence-conversation/domain/message-status.policy.js'

const T0 = '2026-09-24T10:00:00.000Z'
const T1 = '2026-09-24T10:01:00.000Z'
const T2 = '2026-09-24T10:02:00.000Z'

function state(status: MessageStatusState['status'], times: Record<string, string> = {}) {
  return { status, statusTimes: { [status]: T0, ...times } }
}

describe('status inicial da mensagem enviada (RF14)', () => {
  test.each([
    ['whatsapp', 'queued'],
    ['email', 'queued'],
    ['app', 'queued'],
    ['portal', 'delivered'],
  ] as const)('%s nasce %s', (channel, status) => {
    expect(initialOutboundStatus(channel)).toBe(status)
  })
})

describe('a escada de cada canal (RF14)', () => {
  test.each([
    ['whatsapp', 'queued', 'sent', 'sent'],
    ['whatsapp', 'sent', 'delivered', 'delivered'],
    ['whatsapp', 'delivered', 'read', 'read'],
    ['whatsapp', 'queued', 'read', 'read'],
    ['whatsapp', 'sent', 'failed', 'failed'],
    ['email', 'queued', 'sent', 'sent'],
    ['email', 'sent', 'delivered', 'delivered'],
    ['email', 'sent', 'bounced', 'bounced'],
    ['email', 'queued', 'failed', 'failed'],
    ['app', 'queued', 'delivered', 'delivered'],
    ['app', 'delivered', 'read', 'read'],
    ['portal', 'delivered', 'read', 'read'],
  ] as const)('%s: %s + %s → %s', (channel, from, incoming, to) => {
    const result = applyMessageStatus({ at: T1, channel, current: state(from), incoming })

    expect(result).toEqual({
      changed: true,
      status: to,
      statusTimes: { [from]: T0, [incoming]: T1 },
    })
  })

  test.each([
    ['email', 'read'],
    ['app', 'sent'],
    ['app', 'failed'],
    ['portal', 'queued'],
    ['portal', 'sent'],
    ['portal', 'failed'],
    ['whatsapp', 'bounced'],
  ] as const)('%s nunca mostra %s — o canal não dá essa confirmação (D7)', (channel, incoming) => {
    const current = state(initialOutboundStatus(channel))
    const result = applyMessageStatus({ at: T1, channel, current, incoming })

    expect(result).toEqual({ changed: false, reason: 'unsupported', ...current })
  })
})

describe('o estado só avança, e o repetido não muda nada (RF14)', () => {
  test('um delivered atrasado não desfaz o read, mas o horário dele entra se faltava', () => {
    const current = state('read')
    const result = applyMessageStatus({
      at: T2,
      channel: 'whatsapp',
      current,
      incoming: 'delivered',
    })

    expect(result).toEqual({
      changed: true,
      status: 'read',
      statusTimes: { delivered: T2, read: T0 },
    })
  })

  test('o mesmo evento de novo é idempotente: nem o horário muda', () => {
    const current = state('delivered', { sent: T0 })
    const result = applyMessageStatus({
      at: T2,
      channel: 'whatsapp',
      current,
      incoming: 'delivered',
    })

    expect(result).toEqual({ changed: false, reason: 'duplicate', ...current })
  })

  test('falha depois de entregue é ignorada; entregue depois de falha também', () => {
    const delivered = state('delivered')
    expect(
      applyMessageStatus({ at: T1, channel: 'email', current: delivered, incoming: 'bounced' }),
    ).toEqual({ changed: false, reason: 'stale', ...delivered })

    const failed = state('failed')
    expect(
      applyMessageStatus({ at: T1, channel: 'whatsapp', current: failed, incoming: 'delivered' }),
    ).toEqual({ changed: false, reason: 'stale', ...failed })
  })

  test('a transição não apaga horário anterior', () => {
    const current = state('sent', { queued: T0 })
    const result = applyMessageStatus({ at: T1, channel: 'email', current, incoming: 'delivered' })

    expect(result.changed && result.statusTimes).toEqual({ delivered: T1, queued: T0, sent: T0 })
  })
})
