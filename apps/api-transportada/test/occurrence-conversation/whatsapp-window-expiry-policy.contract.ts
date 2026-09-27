/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T605 (RF20): a janela de 24 h do WhatsApp, por conversa. Ela abre na última mensagem
 * **recebida** pelo WhatsApp; a última hora é "fechando"; o aviso automático sai uma vez por janela
 * (a chave é o início dela), só se a operação falou pelo WhatsApp naquela janela e só com o aviso
 * ligado para aquele participante; resposta antes do aviso reabre a janela e empurra o aviso para o
 * fim da nova. Fechada, o canal padrão passa para o app (motorista), o portal (contratante com
 * usuário ativo e ocorrência visível), o e-mail (contratante com e-mail) ou o modelo.
 */
import { describe, expect, test } from 'bun:test'

import {
  decideWhatsAppWindowExpiry,
  type WhatsAppWindowExpiryInput,
} from '../../src/occurrence-conversation/domain/whatsapp-window-expiry.policy.js'

const HOUR = 3_600_000
const MINUTE = 60_000
const OPENED_AT = new Date('2026-09-24T12:00:00.000Z')
const CLOSES_AT = new Date(OPENED_AT.getTime() + 24 * HOUR)

function input(overrides: Partial<WhatsAppWindowExpiryInput> = {}): WhatsAppWindowExpiryInput {
  return {
    contractor: { hasEmail: true, hasPortalAccess: false },
    lastInboundWhatsAppAt: OPENED_AT,
    lastOutboundWhatsAppAt: new Date(OPENED_AT.getTime() + 5 * MINUTE),
    now: new Date(OPENED_AT.getTime() + 2 * HOUR),
    noticeSentFor: null,
    participant: 'driver',
    settings: { noticeMinutes: 30, notifyContractor: false, notifyDriver: true },
    ...overrides,
  }
}

const at = (offsetFromClose: number) => new Date(CLOSES_AT.getTime() + offsetFromClose)

describe('a janela do WhatsApp da conversa (spec 183 T605, RF20)', () => {
  test.each([
    ['sem mensagem recebida pelo WhatsApp, não há janela', { lastInboundWhatsAppAt: null }, 'none'],
    ['no meio da janela, aberta', {}, 'open'],
    ['na última hora, fechando', { now: at(-59 * MINUTE) }, 'closing'],
    ['uma hora antes, ainda aberta', { now: at(-HOUR) }, 'open'],
    ['no instante do fim, fechada', { now: at(0) }, 'closed'],
    ['depois do fim, fechada', { now: at(3 * HOUR) }, 'closed'],
  ] as const)('%s', (_label, overrides, state) => {
    const decision = decideWhatsAppWindowExpiry(input(overrides))

    expect(decision.state).toBe(state)
  })

  test('o fim da janela é 24 h depois da última recebida', () => {
    expect(decideWhatsAppWindowExpiry(input()).closesAt).toEqual(CLOSES_AT)
    expect(decideWhatsAppWindowExpiry(input({ lastInboundWhatsAppAt: null })).closesAt).toBeNull()
  })
})

describe('o aviso automático antes de fechar (spec 183 T605, RF20)', () => {
  test.each([
    ['sai na antecedência configurada', { now: at(-30 * MINUTE) }, true],
    ['sai depois dela, ainda dentro da janela', { now: at(-10 * MINUTE) }, true],
    ['não sai antes da antecedência', { now: at(-31 * MINUTE) }, false],
    ['não sai com a janela fechada (fora dela, só modelo)', { now: at(0) }, false],
    ['não sai sem janela', { lastInboundWhatsAppAt: null, now: at(-10 * MINUTE) }, false],
    [
      'não sai sem a operação ter falado pelo WhatsApp na janela',
      { lastOutboundWhatsAppAt: null, now: at(-10 * MINUTE) },
      false,
    ],
    [
      'não sai com a mensagem da operação anterior à janela',
      { lastOutboundWhatsAppAt: new Date(OPENED_AT.getTime() - MINUTE), now: at(-10 * MINUTE) },
      false,
    ],
    [
      'sai uma vez por janela: com o aviso já gravado para este início, não repete',
      { noticeSentFor: OPENED_AT, now: at(-10 * MINUTE) },
      false,
    ],
    [
      'o aviso de uma janela anterior não segura o desta',
      { noticeSentFor: new Date(OPENED_AT.getTime() - 24 * HOUR), now: at(-10 * MINUTE) },
      true,
    ],
    [
      'motorista com o aviso desligado pela empresa',
      {
        now: at(-10 * MINUTE),
        settings: { noticeMinutes: 30, notifyContractor: true, notifyDriver: false },
      },
      false,
    ],
    [
      'contratante: desligado por padrão',
      { now: at(-10 * MINUTE), participant: 'contractor' },
      false,
    ],
    [
      'contratante com o aviso ligado pela empresa',
      {
        now: at(-10 * MINUTE),
        participant: 'contractor',
        settings: { noticeMinutes: 30, notifyContractor: true, notifyDriver: true },
      },
      true,
    ],
    [
      'a antecedência é da empresa',
      {
        now: at(-50 * MINUTE),
        settings: { noticeMinutes: 60, notifyContractor: false, notifyDriver: true },
      },
      true,
    ],
  ] as const)('%s', (_label, overrides, due) => {
    const decision = decideWhatsAppWindowExpiry(input(overrides))

    expect(decision.notice === null ? false : decision.notice.due).toBe(due)
  })

  test('a chave idempotente do aviso é o início da janela', () => {
    const decision = decideWhatsAppWindowExpiry(input({ now: at(-10 * MINUTE) }))

    expect(decision.notice).toEqual({
      due: true,
      dueAt: at(-30 * MINUTE),
      windowStartedAt: OPENED_AT,
    })
  })

  test('a resposta antes do aviso reabre a janela: o aviso vai para o fim da nova', () => {
    const repliedAt = at(-40 * MINUTE)
    const decision = decideWhatsAppWindowExpiry(
      input({
        lastInboundWhatsAppAt: repliedAt,
        lastOutboundWhatsAppAt: at(-35 * MINUTE),
        now: at(-10 * MINUTE),
      }),
    )

    expect(decision.state).toBe('open')
    expect(decision.notice?.due).toBe(false)
    expect(decision.notice?.dueAt).toEqual(new Date(repliedAt.getTime() + 24 * HOUR - 30 * MINUTE))
    expect(decision.notice?.windowStartedAt).toEqual(repliedAt)
  })

  test('a resposta que a operação não devolveu pelo WhatsApp não gera aviso na nova janela', () => {
    const decision = decideWhatsAppWindowExpiry(
      input({ lastInboundWhatsAppAt: at(-40 * MINUTE), now: at(-10 * MINUTE) }),
    )

    expect(decision.notice).toBeNull()
  })
})

describe('o canal depois que a janela fecha (spec 183 T605, RF20)', () => {
  test.each([
    ['motorista vai para o app', { participant: 'driver' }, 'app'],
    [
      'contratante com usuário no portal e ocorrência visível vai para o portal',
      { contractor: { hasEmail: true, hasPortalAccess: true }, participant: 'contractor' },
      'portal',
    ],
    [
      'contratante sem portal, com e-mail, vai para o e-mail',
      { contractor: { hasEmail: true, hasPortalAccess: false }, participant: 'contractor' },
      'email',
    ],
    [
      'contratante sem portal e sem e-mail fica só com o modelo',
      { contractor: { hasEmail: false, hasPortalAccess: false }, participant: 'contractor' },
      'template',
    ],
  ] as const)('%s', (_label, overrides, channel) => {
    const decision = decideWhatsAppWindowExpiry(input({ ...overrides, now: at(HOUR) }))

    expect(decision.nextChannel).toBe(channel)
    expect(decision.switchDefaultChannel).toBe(true)
  })

  test('com a janela aberta, o canal padrão não muda — mas a caixa de envio já diz o próximo', () => {
    const decision = decideWhatsAppWindowExpiry(input({ now: at(-10 * MINUTE) }))

    expect(decision.switchDefaultChannel).toBe(false)
    expect(decision.nextChannel).toBe('app')
  })

  test('sem janela nenhuma não há troca a fazer', () => {
    expect(
      decideWhatsAppWindowExpiry(input({ lastInboundWhatsAppAt: null })).switchDefaultChannel,
    ).toBe(false)
  })
})
