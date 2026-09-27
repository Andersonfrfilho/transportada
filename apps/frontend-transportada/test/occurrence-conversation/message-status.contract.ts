/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T703 (P8, RF14, D7): o selo de status de cada mensagem que sai. Mostra só a confirmação
 * que o canal consegue dar — o e-mail nunca mostra "lida", o portal nunca "na fila" —, com o horário
 * de cada passo, na ordem do canal. Falha e devolução ficam em destaque com o motivo, e a ação
 * "Reenviar por outro canal" só aparece quando existe outro canal para aquela parte.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  CONVERSATION_STATUS_LADDERS,
  describeMessageStatus,
  hasPendingOutboundStatus,
  resendChannelFor,
} from '@/modules/occurrence-conversation/shared/messageStatus.service'
import type { OccurrenceConversationMessage } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

const API_POLICY = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/message-status.policy.ts',
  import.meta.url,
)

function message(overrides: Partial<OccurrenceConversationMessage>): OccurrenceConversationMessage {
  return {
    attachments: [],
    author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-1' },
    bodyText: 'Autorizam a descarga?',
    channel: 'email',
    createdAt: '2026-09-25T12:00:00.000Z',
    direction: 'outbound',
    id: 'message-1',
    status: 'queued',
    statusTimes: { queued: '2026-09-25T12:00:00.000Z' },
    ...overrides,
  }
}

describe('o selo pelo canal (spec 183 T703)', () => {
  test('as escadas são as da política da API', async () => {
    const policy = await readFile(API_POLICY, 'utf8')

    for (const [channel, ladder] of Object.entries(CONVERSATION_STATUS_LADDERS)) {
      expect(policy).toInclude(`ladder: [${ladder.map((status) => `'${status}'`).join(', ')}]`)
      expect(policy).toMatch(new RegExp(`\\n  ${channel}: \\{`, 'u'))
    }
  })

  test.each([
    ['email', 'delivered', ['queued', 'sent', 'delivered']],
    ['whatsapp', 'read', ['queued', 'sent', 'delivered', 'read']],
    ['app', 'read', ['queued', 'delivered', 'read']],
    ['portal', 'read', ['delivered', 'read']],
  ] as const)('%s em %s: os horários na ordem do canal', (channel, status, steps) => {
    const statusTimes = Object.fromEntries(
      steps.map((step, index) => [step, `2026-09-25T12:0${String(index)}:00.000Z`]),
    )

    const view = describeMessageStatus(message({ channel, status, statusTimes }))

    expect(view).toEqual({
      failure: null,
      steps: steps.map((step, index) => ({
        at: `2026-09-25T12:0${String(index)}:00.000Z`,
        status: step,
      })),
      value: status,
    })
  })

  test('e-mail nunca mostra "lida": um read que chegue vira o último passo que o canal dá', () => {
    const view = describeMessageStatus(
      message({
        status: 'read',
        statusTimes: {
          delivered: '2026-09-25T12:02:00.000Z',
          queued: '2026-09-25T12:00:00.000Z',
          read: '2026-09-25T12:05:00.000Z',
          sent: '2026-09-25T12:01:00.000Z',
        },
      }),
    )

    expect(view?.value).toBe('delivered')
    expect(view?.steps.map((step) => step.status)).toEqual(['queued', 'sent', 'delivered'])
  })

  test('passo sem horário gravado não aparece; mensagem recebida não tem selo', () => {
    expect(
      describeMessageStatus(
        message({ status: 'delivered', statusTimes: { delivered: '2026-09-25T12:02:00.000Z' } }),
      )?.steps,
    ).toEqual([{ at: '2026-09-25T12:02:00.000Z', status: 'delivered' }])
    expect(describeMessageStatus(message({ direction: 'inbound', status: null }))).toBeNull()
  })

  test('falha e devolução: o passo de falha com o horário, e o motivo', () => {
    const bounced = describeMessageStatus(
      message({
        status: 'bounced',
        statusTimes: {
          bounced: '2026-09-25T12:03:00.000Z',
          queued: '2026-09-25T12:00:00.000Z',
          sent: '2026-09-25T12:01:00.000Z',
        },
      }),
    )

    expect(bounced).toEqual({
      failure: 'bounced',
      steps: [
        { at: '2026-09-25T12:00:00.000Z', status: 'queued' },
        { at: '2026-09-25T12:01:00.000Z', status: 'sent' },
        { at: '2026-09-25T12:03:00.000Z', status: 'bounced' },
      ],
      value: 'bounced',
    })
    expect(
      describeMessageStatus(message({ channel: 'whatsapp', status: 'failed', statusTimes: {} }))
        ?.failure,
    ).toBe('failed')
  })
})

describe('reenviar por outro canal (spec 183 T703)', () => {
  test('e-mail que voltou vai pelo portal quando a contratante tem portal; sem portal, não há outro', () => {
    const bounced = message({ status: 'bounced' })

    expect(resendChannelFor(bounced, { participant: 'contractor', portalAvailable: true })).toBe(
      'portal',
    )
    expect(resendChannelFor(bounced, { participant: 'contractor', portalAvailable: false })).toBe(
      null,
    )
  })

  test('WhatsApp que falhou: a contratante pelo portal, ou pelo e-mail; o motorista pelo app', () => {
    const failed = message({ channel: 'whatsapp', status: 'failed' })

    expect(resendChannelFor(failed, { participant: 'contractor', portalAvailable: true })).toBe(
      'portal',
    )
    expect(resendChannelFor(failed, { participant: 'contractor', portalAvailable: false })).toBe(
      'email',
    )
    expect(resendChannelFor(failed, { participant: 'driver', portalAvailable: false })).toBe('app')
  })

  test('mensagem que não falhou não oferece reenvio', () => {
    expect(
      resendChannelFor(message({ status: 'delivered' }), {
        participant: 'contractor',
        portalAvailable: true,
      }),
    ).toBeNull()
  })
})

describe('o selo muda sozinho (spec 183 T703)', () => {
  test('enquanto alguma mensagem que sai ainda pode avançar, a conversa volta a ser lida', () => {
    expect(hasPendingOutboundStatus([message({ status: 'queued' })])).toBe(true)
    expect(hasPendingOutboundStatus([message({ channel: 'whatsapp', status: 'delivered' })])).toBe(
      true,
    )
    expect(
      hasPendingOutboundStatus([
        message({ status: 'delivered' }),
        message({ channel: 'portal', status: 'read' }),
        message({ status: 'bounced' }),
        message({ direction: 'inbound', status: null }),
      ]),
    ).toBe(false)
  })
})
