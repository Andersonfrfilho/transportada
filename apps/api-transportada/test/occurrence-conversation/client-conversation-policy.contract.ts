/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T1 (D1–D5, RF1, RF2, RF5, RF7): o contrato da conversa do cliente, antes da API. O estado que a entrega
 * dá à mensagem, o destino sempre mascarado e a faixa "Canais abertos" — quem entra, em que ordem e com que estado.
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_CONVERSATION_PARTICIPANTS } from '../../src/database/occurrence-conversation.schema.js'
import { CONTRACTOR_REPLY_DELIVERY_TARGETS } from '../../src/shared/occurrence-contractor-reply.constant.js'
import {
  CLIENT_CONVERSATION_DELIVERY_TARGETS,
  CLIENT_CONVERSATION_PARTICIPANT,
  clientAddressKey,
  clientMessageStatusFromDelivery,
  maskClientAddress,
  resolveClientChannels,
  resolveClientReplyTarget,
  type ClientChannelMessage,
} from '../../src/occurrence-conversation/domain/client-conversation.policy.js'

const NUMBER = '+5516999991234'
const OTHER_NUMBER = '+5516988884321'
const EMAIL = 'financeiro@mercado.com.br'

function sent(
  address: string,
  createdAt: string,
  status: ClientChannelMessage['status'] = 'sent',
  channel: ClientChannelMessage['channel'] = 'whatsapp',
): ClientChannelMessage {
  return { address, channel, createdAt, direction: 'outbound', status }
}

function replied(address: string, createdAt: string): ClientChannelMessage {
  return { address, channel: 'whatsapp', createdAt, direction: 'inbound', status: null }
}

describe('o cliente é o terceiro participante (D2)', () => {
  test('participant `client` ao lado de contractor e driver', () => {
    expect(CLIENT_CONVERSATION_PARTICIPANT).toBe('client')
    expect(OCCURRENCE_CONVERSATION_PARTICIPANTS).toContain('contractor')
    expect(OCCURRENCE_CONVERSATION_PARTICIPANTS).toContain('driver')
  })

  test('as entregas que abrem a conversa são as do cliente, e cada uma tem o seu canal', () => {
    expect(CLIENT_CONVERSATION_DELIVERY_TARGETS).toEqual({
      client_boleto_emails: 'email',
      client_boleto_whatsapp: 'whatsapp',
    })
    for (const target of Object.keys(CLIENT_CONVERSATION_DELIVERY_TARGETS)) {
      expect(CONTRACTOR_REPLY_DELIVERY_TARGETS).toContain(
        target as (typeof CONTRACTOR_REPLY_DELIVERY_TARGETS)[number],
      )
    }
  })
})

describe('a mensagem acompanha a entrega (RF1, RF5)', () => {
  test.each([
    ['queued', 'queued'],
    ['sent', 'sent'],
    ['failed', 'failed'],
    ['skipped', null],
    ['pending_window', null],
  ] as const)('entrega %s → mensagem %s', (delivery, message) => {
    expect(clientMessageStatusFromDelivery(delivery)).toBe(message)
  })
})

describe('o destino nunca sai em claro (RF7)', () => {
  test('número com os quatro últimos dígitos', () => {
    expect(maskClientAddress('whatsapp', NUMBER)).toBe('+55 ••••1234')
    expect(maskClientAddress('whatsapp', NUMBER)).not.toContain('99999')
  })

  test('e-mail sem o endereço inteiro', () => {
    const masked = maskClientAddress('email', EMAIL)
    expect(masked).not.toBe(EMAIL)
    expect(masked).not.toContain('financeiro')
  })

  test('mesmo contato com outra grafia é a mesma chave', () => {
    expect(clientAddressKey('whatsapp', '+55 (16) 99999-1234')).toBe(
      clientAddressKey('whatsapp', NUMBER),
    )
    /** O WhatsApp entrega o mesmo celular sem o nono dígito. */
    expect(clientAddressKey('whatsapp', '551699991234')).toBe(clientAddressKey('whatsapp', NUMBER))
    expect(clientAddressKey('email', ' Financeiro@Mercado.com.br ')).toBe(
      clientAddressKey('email', EMAIL),
    )
  })
})

describe('a faixa "Canais abertos" (D4)', () => {
  const contacts = [
    { address: NUMBER, channel: 'whatsapp' as const },
    { address: OTHER_NUMBER, channel: 'whatsapp' as const },
    { address: EMAIL, channel: 'email' as const },
  ]

  test('sem envio não há canal', () => {
    expect(resolveClientChannels({ contacts, messages: [] })).toEqual([])
  })

  test('cliente com dois números: dois canais numa conversa, na ordem da primeira atividade', () => {
    const channels = resolveClientChannels({
      contacts,
      messages: [
        sent(OTHER_NUMBER, '2026-10-27T10:05:00.000Z', 'delivered'),
        sent(NUMBER, '2026-10-27T10:00:00.000Z', 'read'),
      ],
    })
    expect(channels.map((channel) => [channel.addressMasked, channel.state])).toEqual([
      ['+55 ••••1234', 'read'],
      ['+55 ••••4321', 'delivered'],
    ])
  })

  test('dois envios no mesmo instante: a ordem não depende de quem o banco devolveu primeiro', () => {
    const at = '2026-10-27T10:00:00.000Z'
    const forward = resolveClientChannels({
      contacts,
      messages: [sent(NUMBER, at, 'read'), sent(OTHER_NUMBER, at, 'failed')],
    })
    const backward = resolveClientChannels({
      contacts,
      messages: [sent(OTHER_NUMBER, at, 'failed'), sent(NUMBER, at, 'read')],
    })
    expect(backward).toEqual(forward)
  })

  test('o WhatsApp cai e o e-mail de reserva envia: as duas entregas aparecem', () => {
    const channels = resolveClientChannels({
      contacts,
      messages: [
        sent(NUMBER, '2026-10-27T10:00:00.000Z', 'failed'),
        sent(EMAIL, '2026-10-27T10:00:01.000Z', 'sent', 'email'),
      ],
    })
    expect(channels.map((channel) => [channel.channel, channel.state])).toEqual([
      ['whatsapp', 'failed'],
      ['email', 'sent'],
    ])
  })

  test('e-mail devolvido (caixa cheia) é falhou', () => {
    const [channel] = resolveClientChannels({
      contacts,
      messages: [sent(EMAIL, '2026-10-27T10:00:00.000Z', 'bounced', 'email')],
    })
    expect(channel?.state).toBe('failed')
  })

  test('resposta depois do envio é "respondeu"; reenvio depois dela volta ao estado do envio', () => {
    const answered = resolveClientChannels({
      contacts,
      messages: [
        sent(NUMBER, '2026-10-27T10:00:00.000Z', 'read'),
        replied('5516999991234', '2026-10-27T10:10:00.000Z'),
      ],
    })
    expect(answered[0]?.state).toBe('replied')
    expect(answered[0]?.lastActivityAt).toBe('2026-10-27T10:10:00.000Z')

    const resent = resolveClientChannels({
      contacts,
      messages: [
        sent(NUMBER, '2026-10-27T10:00:00.000Z', 'read'),
        replied('5516999991234', '2026-10-27T10:10:00.000Z'),
        sent(NUMBER, '2026-10-27T10:20:00.000Z', 'queued'),
      ],
    })
    expect(resent).toHaveLength(1)
    expect(resent[0]?.state).toBe('queued')
  })

  test('contato removido: a conversa fica, o canal some da faixa', () => {
    const channels = resolveClientChannels({
      contacts: [{ address: EMAIL, channel: 'email' }],
      messages: [
        sent(NUMBER, '2026-10-27T10:00:00.000Z', 'read'),
        sent(EMAIL, '2026-10-27T10:00:01.000Z', 'sent', 'email'),
      ],
    })
    expect(channels.map((channel) => channel.channel)).toEqual(['email'])
  })

  test('nenhum destino sai em claro na faixa', () => {
    const serialized = JSON.stringify(
      resolveClientChannels({
        contacts,
        messages: [
          sent(NUMBER, '2026-10-27T10:00:00.000Z'),
          sent(EMAIL, '2026-10-27T10:00:01.000Z', 'sent', 'email'),
        ],
      }),
    )
    expect(serialized).not.toContain('99999')
    expect(serialized).not.toContain('financeiro')
  })
})

describe('"Responder por" (T5, D6)', () => {
  const contacts = [
    { address: NUMBER, channel: 'whatsapp' as const },
    { address: EMAIL, channel: 'email' as const },
  ]
  const DELIVERY = '00000000-0000-4000-8000-000000283601'
  const EMAIL_DELIVERY = '00000000-0000-4000-8000-000000283602'
  const boleto = { ...sent(NUMBER, '2026-10-27T10:00:00.000Z'), deliveryId: DELIVERY }
  const mail = {
    ...sent(EMAIL, '2026-10-27T10:01:00.000Z', 'sent', 'email'),
    deliveryId: EMAIL_DELIVERY,
  }

  test('o WhatsApp com entrega leva o alvo opaco; o e-mail não responde', () => {
    const channels = resolveClientChannels({ contacts, messages: [boleto, mail] })
    expect(channels.map((channel) => channel.replyTarget)).toEqual([
      { confirmed: false, id: DELIVERY },
      null,
    ])
  })

  test('depois da primeira resposta do painel o número está confirmado', () => {
    const panel = {
      ...sent(NUMBER, '2026-10-27T10:05:00.000Z'),
      deliveryId: null,
      panelReply: true,
    }
    const channels = resolveClientChannels({ contacts, messages: [boleto, panel] })
    expect(channels[0]?.replyTarget).toEqual({ confirmed: true, id: DELIVERY })
    expect(
      resolveClientReplyTarget({ contacts, messages: [boleto, panel], replyTargetId: DELIVERY }),
    ).toEqual({ address: NUMBER, confirmed: true })
  })

  test('alvo de outra conversa, de e-mail ou de contato removido não responde', () => {
    const messages = [boleto, mail]
    expect(
      resolveClientReplyTarget({ contacts, messages, replyTargetId: crypto.randomUUID() }),
    ).toBeNull()
    expect(
      resolveClientReplyTarget({ contacts, messages, replyTargetId: EMAIL_DELIVERY }),
    ).toBeNull()
    expect(
      resolveClientReplyTarget({
        contacts: [{ address: EMAIL, channel: 'email' }],
        messages,
        replyTargetId: DELIVERY,
      }),
    ).toBeNull()
    expect(resolveClientReplyTarget({ contacts, messages, replyTargetId: DELIVERY })).toEqual({
      address: NUMBER,
      confirmed: false,
    })
  })
})
