/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2: as regras puras da caixa de conversas — o JID que entra, quem atende agora (vencimento checado na
 * leitura), a decisão de assumir entre dois atendentes, o prazo da empresa e o status que só avança.
 */
import { describe, expect, test } from 'bun:test'

import {
  WHATSAPP_CHAT_AUTHOR_DIRECTION,
  WHATSAPP_CHAT_MESSAGE_AUTHORS,
  WHATSAPP_CHAT_MESSAGE_STATUSES,
  WHATSAPP_CHAT_TAKEOVER_TIMEOUT_SECONDS,
} from '../../src/whatsapp-inbox/domain/whatsapp-chat.constant.js'
import {
  classifyWhatsAppChatJid,
  directWhatsAppChatJid,
} from '../../src/whatsapp-inbox/domain/whatsapp-chat-jid.policy.js'
import {
  canAdvanceWhatsAppChatMessageStatus,
  initialWhatsAppChatMessageStatus,
  whatsAppChatMessageDirection,
  whatsAppChatStatusesAdvancingTo,
} from '../../src/whatsapp-inbox/domain/whatsapp-chat-message.policy.js'
import {
  computeWhatsAppChatTakeoverExpiry,
  decideWhatsAppChatTakeOver,
  isWhatsAppChatTakenOver,
  resolveWhatsAppChatAttendance,
  resolveWhatsAppChatTakeoverTimeoutSeconds,
} from '../../src/whatsapp-inbox/domain/whatsapp-chat-takeover.policy.js'

const NOW = new Date('2026-11-10T22:00:00.000Z')
const LATER = new Date('2026-11-10T22:30:00.000Z')
const EARLIER = new Date('2026-11-10T21:59:59.000Z')
const ANA = '00000000-0000-4000-8000-000000031901'
const BIA = '00000000-0000-4000-8000-000000031902'

describe('o JID do chat (spec 319 T2)', () => {
  test('grupo e privado pelo número entram; @lid, @c.us e broadcast não', () => {
    expect(classifyWhatsAppChatJid('120363025246125486@g.us')).toBe('group')
    expect(classifyWhatsAppChatJid('5516991234567-1600000000@g.us')).toBe('group')
    expect(classifyWhatsAppChatJid('5516991234567@s.whatsapp.net')).toBe('direct')
    for (const jid of [
      '123456789012345@lid',
      '5516991234567@c.us',
      'status@broadcast',
      '5516991234567',
      '1234567@s.whatsapp.net',
      '',
    ]) {
      expect(classifyWhatsAppChatJid(jid)).toBeNull()
    }
  })

  test('o privado é montado só a partir de dígitos ou de um JID de privado', () => {
    expect(directWhatsAppChatJid('5516991234567')).toBe('5516991234567@s.whatsapp.net')
    expect(directWhatsAppChatJid('5516991234567@s.whatsapp.net')).toBe(
      '5516991234567@s.whatsapp.net',
    )
    expect(directWhatsAppChatJid('123456789012345@lid')).toBeNull()
    expect(directWhatsAppChatJid('+55 16 99123-4567')).toBeNull()
  })
})

describe('quem atende o chat (spec 319 T2, RF1/RF6)', () => {
  const held = { expiresAt: LATER, state: 'operator' as const, takenOverByUserId: ANA }

  test('com o bot, ou assumido com prazo vencido, quem atende é o bot', () => {
    expect(
      resolveWhatsAppChatAttendance(
        { expiresAt: null, state: 'bot', takenOverByUserId: null },
        NOW,
      ),
    ).toEqual({ kind: 'bot' })
    expect(resolveWhatsAppChatAttendance({ ...held, expiresAt: NOW }, NOW)).toEqual({
      kind: 'bot',
    })
    expect(isWhatsAppChatTakenOver({ ...held, expiresAt: EARLIER }, NOW)).toBe(false)
  })

  test('assumido dentro do prazo é do atendente, com o vencimento', () => {
    expect(resolveWhatsAppChatAttendance(held, NOW)).toEqual({
      expiresAt: LATER,
      kind: 'operator',
      userId: ANA,
    })
    expect(isWhatsAppChatTakenOver(held, NOW)).toBe(true)
  })

  test('assumir: livre assume, o próprio renova, outro recebe quem segura', () => {
    expect(decideWhatsAppChatTakeOver({ ...held, expiresAt: EARLIER }, BIA, NOW)).toEqual({
      kind: 'take',
    })
    expect(decideWhatsAppChatTakeOver(held, ANA, NOW)).toEqual({ kind: 'renew' })
    expect(decideWhatsAppChatTakeOver(held, BIA, NOW)).toEqual({
      expiresAt: LATER,
      holderUserId: ANA,
      kind: 'held',
    })
  })

  test('o prazo da empresa fica na faixa; fora dela ou sem configuração, 30 min', () => {
    expect(WHATSAPP_CHAT_TAKEOVER_TIMEOUT_SECONDS.default).toBe(1800)
    expect(resolveWhatsAppChatTakeoverTimeoutSeconds(null)).toBe(1800)
    expect(resolveWhatsAppChatTakeoverTimeoutSeconds(600)).toBe(600)
    expect(resolveWhatsAppChatTakeoverTimeoutSeconds(299)).toBe(1800)
    expect(resolveWhatsAppChatTakeoverTimeoutSeconds(28_801)).toBe(1800)
    expect(resolveWhatsAppChatTakeoverTimeoutSeconds(600.5)).toBe(1800)
    expect(computeWhatsAppChatTakeoverExpiry(NOW, 1800)).toEqual(LATER)
  })
})

describe('o histórico do chat (spec 319 T2, RF3/RF4)', () => {
  test('autor decide direção e o status de nascença', () => {
    for (const author of WHATSAPP_CHAT_MESSAGE_AUTHORS) {
      expect(whatsAppChatMessageDirection(author)).toBe(WHATSAPP_CHAT_AUTHOR_DIRECTION[author])
    }
    expect(initialWhatsAppChatMessageStatus('driver')).toBeNull()
    expect(initialWhatsAppChatMessageStatus('member')).toBeNull()
    expect(initialWhatsAppChatMessageStatus('operator')).toBe('queued')
    expect(initialWhatsAppChatMessageStatus('bot')).toBe('sent')
    expect(initialWhatsAppChatMessageStatus('phone')).toBe('sent')
  })

  test('o status só avança; falha só de `queued` e volta só a `queued` (reenvio)', () => {
    expect(canAdvanceWhatsAppChatMessageStatus('queued', 'sent')).toBe(true)
    expect(canAdvanceWhatsAppChatMessageStatus('sent', 'read')).toBe(true)
    expect(canAdvanceWhatsAppChatMessageStatus('read', 'delivered')).toBe(false)
    expect(canAdvanceWhatsAppChatMessageStatus('sent', 'sent')).toBe(false)
    expect(canAdvanceWhatsAppChatMessageStatus('sent', 'failed')).toBe(false)
    expect(canAdvanceWhatsAppChatMessageStatus('queued', 'failed')).toBe(true)
    expect(canAdvanceWhatsAppChatMessageStatus('failed', 'queued')).toBe(true)
    expect(canAdvanceWhatsAppChatMessageStatus('failed', 'sent')).toBe(false)
  })

  test('o WHERE do repositório sai da mesma regra', () => {
    for (const to of WHATSAPP_CHAT_MESSAGE_STATUSES) {
      const from = whatsAppChatStatusesAdvancingTo(to)
      for (const candidate of WHATSAPP_CHAT_MESSAGE_STATUSES) {
        expect(from.includes(candidate)).toBe(canAdvanceWhatsAppChatMessageStatus(candidate, to))
      }
    }
    expect(whatsAppChatStatusesAdvancingTo('read')).toEqual(['queued', 'sent', 'delivered'])
  })
})
