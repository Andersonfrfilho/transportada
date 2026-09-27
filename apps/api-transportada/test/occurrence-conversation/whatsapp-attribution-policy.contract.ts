/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T501 (RF9, D6): a mensagem que chega pelo WhatsApp vai para uma conversa só quando não há
 * dúvida. Contratante: pela resposta (`context.id`) a uma mensagem da conversa; sem ela, à única
 * conversa aberta daquele contato — duas ou nenhuma vão para "não atribuída". Número sem aceite é
 * recusado. Motorista: só a resposta a uma mensagem da conversa dele entra; o resto segue para os
 * fluxos de comando da spec 144, como hoje.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveWhatsAppAttribution,
  type WhatsAppAttributionInput,
} from '../../src/occurrence-conversation/domain/whatsapp-attribution.policy.js'

const CONTACT = { contactId: 'contact-1', contractorId: 'contractor-alfa', optedIn: true } as const

function input(overrides: Partial<WhatsAppAttributionInput> = {}): WhatsAppAttributionInput {
  return {
    openContractorConversations: [],
    replyTo: null,
    sender: { contractorContacts: [CONTACT], driverUserId: null },
    ...overrides,
  }
}

describe('a atribuição da mensagem de WhatsApp (spec 183 T501)', () => {
  test.each([
    [
      'contratante respondendo a uma mensagem da conversa dela',
      input({
        replyTo: {
          contractorId: 'contractor-alfa',
          conversationId: 'conversation-reply',
          driverUserId: null,
          participant: 'contractor',
        },
        openContractorConversations: [
          { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
          { contractorId: 'contractor-alfa', conversationId: 'conversation-b' },
        ],
      }),
      { conversationId: 'conversation-reply', kind: 'conversation', via: 'reply' },
    ],
    [
      'contratante sem resposta e com uma só conversa aberta',
      input({
        openContractorConversations: [
          { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
        ],
      }),
      { conversationId: 'conversation-a', kind: 'conversation', via: 'single_open' },
    ],
    [
      'contratante sem resposta e com duas conversas abertas: o operador escolhe',
      input({
        openContractorConversations: [
          { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
          { contractorId: 'contractor-alfa', conversationId: 'conversation-b' },
        ],
      }),
      { kind: 'unassigned', reason: 'ambiguous' },
    ],
    [
      'contratante sem resposta e sem conversa aberta',
      input(),
      { kind: 'unassigned', reason: 'no_open_conversation' },
    ],
    [
      'mesmo número em contatos de duas contratantes, sem resposta',
      input({
        openContractorConversations: [
          { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
          { contractorId: 'contractor-beta', conversationId: 'conversation-b' },
        ],
        sender: {
          contractorContacts: [
            CONTACT,
            { contactId: 'contact-2', contractorId: 'contractor-beta', optedIn: true },
          ],
          driverUserId: null,
        },
      }),
      { kind: 'unassigned', reason: 'ambiguous' },
    ],
    [
      'conversa aberta de outra contratante não é candidata',
      input({
        openContractorConversations: [
          { contractorId: 'contractor-beta', conversationId: 'conversation-b' },
        ],
      }),
      { kind: 'unassigned', reason: 'no_open_conversation' },
    ],
    [
      'resposta a uma conversa de outra contratante não é aceita como resposta',
      input({
        replyTo: {
          contractorId: 'contractor-beta',
          conversationId: 'conversation-beta',
          driverUserId: null,
          participant: 'contractor',
        },
      }),
      { kind: 'unassigned', reason: 'no_open_conversation' },
    ],
    [
      'número de contato sem aceite: recusado (D6)',
      input({
        sender: { contractorContacts: [{ ...CONTACT, optedIn: false }], driverUserId: null },
      }),
      { kind: 'rejected', reason: 'no_opt_in' },
    ],
    [
      'número que não é de contato nem de motorista: recusado',
      input({ sender: { contractorContacts: [], driverUserId: null } }),
      { kind: 'rejected', reason: 'not_a_contact' },
    ],
    [
      'motorista respondendo a uma mensagem da conversa dele',
      input({
        replyTo: {
          contractorId: null,
          conversationId: 'conversation-driver',
          driverUserId: 'driver-1',
          participant: 'driver',
        },
        sender: { contractorContacts: [], driverUserId: 'driver-1' },
      }),
      { conversationId: 'conversation-driver', kind: 'conversation', via: 'reply' },
    ],
    [
      'motorista sem resposta: segue para os fluxos de comando (spec 144)',
      input({ sender: { contractorContacts: [], driverUserId: 'driver-1' } }),
      { kind: 'command_flow' },
    ],
    [
      'motorista respondendo à conversa de outro motorista: fluxos de comando',
      input({
        replyTo: {
          contractorId: null,
          conversationId: 'conversation-driver',
          driverUserId: 'driver-2',
          participant: 'driver',
        },
        sender: { contractorContacts: [], driverUserId: 'driver-1' },
      }),
      { kind: 'command_flow' },
    ],
    [
      'número que é de motorista e de contato, sem resposta: o fluxo de comando não muda',
      input({ sender: { contractorContacts: [CONTACT], driverUserId: 'driver-1' } }),
      { kind: 'command_flow' },
    ],
  ])('%s', (_label, attributionInput, expected) => {
    expect(resolveWhatsAppAttribution(attributionInput) as unknown).toEqual(expected)
  })
})
