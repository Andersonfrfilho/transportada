/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4: as políticas puras da conversa por assunto — rótulo (lista e sino), estado efetivo,
 * ordem dos canais e quem alcança a conversa.
 */
import { describe, expect, test } from 'bun:test'

import { orderConversationChannels } from '../../src/occurrence-conversation/domain/conversation-channels.policy.js'
import { resolveEffectiveConversationStatus } from '../../src/occurrence-conversation/domain/conversation-effective-status.policy.js'
import { canReachSubjectConversation } from '../../src/occurrence-conversation/domain/conversation-subject-access.policy.js'
import {
  buildNoticeLabel,
  buildSubjectLabel,
} from '../../src/occurrence-conversation/domain/conversation-subject-label.policy.js'
import type { SubjectLabelFacts } from '../../src/occurrence-conversation/domain/conversation-subject-label.policy.js'

const DOCUMENT: SubjectLabelFacts = {
  invoiceNumber: '4521',
  recipientName: 'Casa Verde',
  subjectType: 'document',
}

describe('o rótulo do assunto (spec 260 T2.4)', () => {
  test('nota: a lista leva o destinatário, o sino leva só o número', () => {
    expect(buildSubjectLabel(DOCUMENT)).toBe('NF 4521 · Casa Verde')
    expect(buildNoticeLabel(DOCUMENT)).toBe('NF 4521')
    expect(buildSubjectLabel({ ...DOCUMENT, recipientName: null })).toBe('NF 4521')
    expect(buildSubjectLabel({ ...DOCUMENT, recipientName: '   ' })).toBe('NF 4521')
    expect(buildSubjectLabel({ ...DOCUMENT, invoiceNumber: '' })).toBe('Nota · Casa Verde')
  })

  test('destinatário de nome longo é encurtado na lista e nunca vai ao sino', () => {
    const label = buildSubjectLabel({
      ...DOCUMENT,
      recipientName: 'Comércio de Materiais de Construção Casa Verde Ltda',
    })
    expect(label.startsWith('NF 4521 · Comércio de Materiais de')).toBe(true)
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual('NF 4521 · '.length + 30)
    expect(buildNoticeLabel({ ...DOCUMENT, recipientName: 'Fulano de Tal' })).toBe('NF 4521')
  })

  test('ocorrência: tipo e parada; sem parada, tipo e nota; sem nada, só o tipo', () => {
    const occurrence = {
      invoiceNumber: null,
      stopSequence: 3,
      subjectType: 'occurrence',
      typeName: 'Avaria',
    } as const
    expect(buildSubjectLabel(occurrence)).toBe('Avaria · parada 3')
    expect(buildNoticeLabel(occurrence)).toBe('Avaria · parada 3')
    expect(buildSubjectLabel({ ...occurrence, invoiceNumber: '4521', stopSequence: null })).toBe(
      'Avaria · NF 4521',
    )
    expect(buildSubjectLabel({ ...occurrence, stopSequence: null })).toBe('Avaria')
  })

  test('viagem: a data no fuso de São Paulo, não no do servidor', () => {
    expect(
      buildSubjectLabel({
        referenceDate: new Date('2026-10-09T15:00:00.000Z'),
        subjectType: 'trip',
      }),
    ).toBe('Viagem de 09/10')
    /** 01h UTC do dia 10 ainda é noite do dia 9 em São Paulo (UTC-3). */
    expect(
      buildNoticeLabel({
        referenceDate: new Date('2026-10-10T01:00:00.000Z'),
        subjectType: 'trip',
      }),
    ).toBe('Viagem de 09/10')
  })
})

describe('o estado efetivo da conversa (spec 260, ADR-0101 §4)', () => {
  const open = {
    documentReleasedAt: null,
    storedStatus: 'open',
    subjectType: 'document',
    tripStatus: 'in_transit',
  } as const

  test('aberta enquanto nada a encerra', () => {
    expect(resolveEffectiveConversationStatus(open)).toBe('open')
  })

  test('encerrada pelo escritório, pela nota liberada ou pela viagem terminal', () => {
    expect(resolveEffectiveConversationStatus({ ...open, storedStatus: 'closed' })).toBe('closed')
    expect(resolveEffectiveConversationStatus({ ...open, documentReleasedAt: new Date() })).toBe(
      'closed',
    )
    expect(resolveEffectiveConversationStatus({ ...open, tripStatus: 'completed' })).toBe('closed')
    expect(resolveEffectiveConversationStatus({ ...open, tripStatus: 'cancelled' })).toBe('closed')
  })

  test('a viagem só encerra pelo próprio estado; a nota liberada não conta nela', () => {
    const trip = { ...open, subjectType: 'trip', documentReleasedAt: new Date() } as const
    expect(resolveEffectiveConversationStatus(trip)).toBe('open')
    expect(resolveEffectiveConversationStatus({ ...trip, tripStatus: 'cancelled' })).toBe('closed')
  })

  test('a conversa de ocorrência nunca encerra, como hoje', () => {
    expect(
      resolveEffectiveConversationStatus({
        documentReleasedAt: new Date(),
        storedStatus: 'closed',
        subjectType: 'occurrence',
        tripStatus: 'cancelled',
      }),
    ).toBe('open')
  })
})

describe('os canais da conversa (spec 260 D9)', () => {
  test('ordem estável app, whatsapp, email, portal; repetido e desconhecido saem', () => {
    expect(orderConversationChannels(['portal', 'whatsapp', 'app', 'whatsapp', 'email'])).toEqual([
      'app',
      'whatsapp',
      'email',
      'portal',
    ])
    expect(orderConversationChannels(['webchat', 'telegram'])).toEqual([])
    expect(orderConversationChannels([])).toEqual([])
  })
})

describe('quem alcança a conversa (spec 260, ADR-0101 §3)', () => {
  const base = {
    conversationDriverUserId: 'outro',
    driverUserId: 'eu',
    isPrincipal: false,
    subjectType: 'document',
  } as const

  test('sem conversa, o assunto da tripulação é alcançável', () => {
    expect(canReachSubjectConversation({ ...base, conversationDriverUserId: null })).toBe(true)
  })

  test('o destinatário alcança; o principal agora também; o resto da tripulação não', () => {
    expect(canReachSubjectConversation({ ...base, conversationDriverUserId: 'eu' })).toBe(true)
    expect(canReachSubjectConversation({ ...base, isPrincipal: true })).toBe(true)
    expect(canReachSubjectConversation(base)).toBe(false)
  })

  test('na ocorrência, ser o principal não basta: vale a conversa do próprio usuário', () => {
    expect(
      canReachSubjectConversation({ ...base, isPrincipal: true, subjectType: 'occurrence' }),
    ).toBe(false)
  })
})
