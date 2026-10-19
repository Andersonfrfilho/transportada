/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { applyMessageStatus } from '../../src/occurrence-conversation/domain/message-status.policy.js'

const WORKER = new URL(
  '../../src/occurrence-conversation/domain/message-status.policy.ts',
  import.meta.url,
)
const API = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/message-status.policy.ts',
  import.meta.url,
)

/**
 * Spec 183 T405 (RF14): a API grava o status inicial e o worker aplica o do Resend — os dois pela
 * mesma política, em cópia por valor (as apps não importam código uma da outra). Divergir seria
 * calado: um `delivered` atrasado desfazendo uma falha num lado e não no outro.
 */
describe('paridade da política de status da mensagem (spec 183 T405)', () => {
  test('a cópia do worker diz exatamente o que a da API diz', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])

    const normalize = (source: string) =>
      source
        .split('\n')
        // O tipo dos canais e status vem do schema de cada app; é o único import que diverge.
        .filter((line) => !line.includes('occurrence-conversation.schema.js'))
        // O bloco que explica a cópia só existe do lado copiado.
        .filter(
          (line) => !line.includes('Cópia por valor') && !line.includes('message-status-parity'),
        )
        .map((line) => line.trimEnd())
        .join('\n')

    expect(normalize(worker)).toBe(normalize(api))
  })

  test('o e-mail enviado avança para sent e guarda o horário', () => {
    expect(
      applyMessageStatus({
        at: '2026-09-24T12:00:00.000Z',
        channel: 'email',
        current: { status: 'queued', statusTimes: {} },
        incoming: 'sent',
      }),
    ).toEqual({
      changed: true,
      status: 'sent',
      statusTimes: { sent: '2026-09-24T12:00:00.000Z' },
    })
  })

  test('o e-mail aceita read (spec 274 D8): sent tardio não rebaixa, falha depois de read é velha', () => {
    const delivered = {
      status: 'delivered',
      statusTimes: { delivered: '2026-10-19T12:00:00.000Z' },
    } as const
    const read = applyMessageStatus({
      at: '2026-10-19T12:05:00.000Z',
      channel: 'email',
      current: delivered,
      incoming: 'read',
    })
    expect(read).toEqual({
      changed: true,
      status: 'read',
      statusTimes: { delivered: '2026-10-19T12:00:00.000Z', read: '2026-10-19T12:05:00.000Z' },
    })

    const lateSent = applyMessageStatus({
      at: '2026-10-19T12:06:00.000Z',
      channel: 'email',
      current: { status: 'read', statusTimes: read.statusTimes },
      incoming: 'sent',
    })
    expect(lateSent.status).toBe('read')

    expect(
      applyMessageStatus({
        at: '2026-10-19T12:07:00.000Z',
        channel: 'email',
        current: { status: 'read', statusTimes: read.statusTimes },
        incoming: 'bounced',
      }),
    ).toMatchObject({ changed: false, reason: 'stale', status: 'read' })
  })
})
