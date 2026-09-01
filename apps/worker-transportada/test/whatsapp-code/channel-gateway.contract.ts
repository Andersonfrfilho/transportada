/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T005 — o convite e a recuperação de senha por WhatsApp, pelo mesmo trilho do e-mail.
 */
import { describe, expect, test } from 'bun:test'

import { handleInvitationDelivery } from '../../src/identity/application/deliver-invitation-code.service.js'
import {
  createInvitationChannelGateway,
  InvitationChannelUnavailableError,
} from '../../src/identity/infrastructure/invitation-channel.gateway.js'
import type { WhatsAppCodeSender } from '../../src/whatsapp/infrastructure/whatsapp-code-sender.gateway.js'

const MESSAGE = {
  address: '+55 (16) 99999-1234',
  body: 'Seu código de ativação é 123456.',
  code: '123456',
  companyId: '22222222-2222-4222-8222-222222222222',
  subject: 'Seu código de ativação',
} as const

function recordingSender(input: { readonly fails?: Error } = {}) {
  const calls: Parameters<WhatsAppCodeSender['send']>[0][] = []
  const sender: WhatsAppCodeSender = {
    send: async (request) => {
      if (input.fails !== undefined) throw input.fails
      calls.push(request)
    },
  }

  return { calls, sender }
}

describe('o canal de código por WhatsApp (spec 062 T005)', () => {
  test('o canal `whatsapp` entrega pelo remetente da Meta, com a empresa junto', async () => {
    const whatsapp = recordingSender()
    const gateway = createInvitationChannelGateway({ whatsapp: whatsapp.sender })

    await gateway.send({ ...MESSAGE, channel: 'whatsapp' })

    expect(whatsapp.calls).toHaveLength(1)
    expect(whatsapp.calls[0]?.companyId).toBe(MESSAGE.companyId)
    /** O código sozinho viaja ao lado do corpo: é ele que vira parâmetro do template aprovado. */
    expect(whatsapp.calls[0]?.code).toBe('123456')
  })

  /**
   * ⚠️ Canal sem driver **lança**, e não marca entregue. O código continua válido e reenviável
   * porque quem falhou foi o transporte — dar o convite por enviado sem ele ter saído é o defeito
   * que ninguém descobre até o cliente ligar.
   */
  test('sem remetente configurado o canal falha alto, e não silencia', async () => {
    const gateway = createInvitationChannelGateway({})

    await expect(gateway.send({ ...MESSAGE, channel: 'whatsapp' })).rejects.toBeInstanceOf(
      InvitationChannelUnavailableError,
    )
  })

  test('a falha do remetente sobe para o trilho de retry', async () => {
    const whatsapp = recordingSender({ fails: new Error('graph api down') })
    const gateway = createInvitationChannelGateway({ whatsapp: whatsapp.sender })

    await expect(gateway.send({ ...MESSAGE, channel: 'whatsapp' })).rejects.toThrow(
      'graph api down',
    )
  })

  /** O e-mail não mudou: o campo novo é ignorado por ele, e o corpo inteiro continua a mensagem. */
  test('o canal de e-mail segue intacto ao lado do novo', async () => {
    const sent: { to: string; text: string }[] = []
    const gateway = createInvitationChannelGateway({
      email: {
        driver: 'smtp',
        send: async (params) => {
          sent.push({ text: params.text, to: params.to })

          return { outcome: 'sent' as const }
        },
      },
    })

    await gateway.send({ ...MESSAGE, channel: 'email' })

    expect(sent).toEqual([{ text: MESSAGE.body, to: MESSAGE.address }])
  })

  test('canal sem driver nenhum continua sendo recusa, não envio por e-mail', async () => {
    const gateway = createInvitationChannelGateway({ whatsapp: recordingSender().sender })

    await expect(gateway.send({ ...MESSAGE, channel: 'sms' })).rejects.toBeInstanceOf(
      InvitationChannelUnavailableError,
    )
  })

  /**
   * ⚠️ A fiação, que é o que quebra em silêncio: o serviço de entrega precisa **repassar** a empresa
   * e o código ao canal. Sem isso o gateway compila, o teste de rota passa, e o envio por WhatsApp
   * falha na primeira mensagem — sem empresa não há canal, e sem código não há parâmetro de template.
   */
  test('o trilho do convite repassa empresa e código até o canal', async () => {
    const whatsapp = recordingSender()
    const gateway = createInvitationChannelGateway({ whatsapp: whatsapp.sender })
    const delivered: string[] = []

    await handleInvitationDelivery(
      {
        actorId: '00000000-0000-4000-8000-0000000000aa',
        companyId: MESSAGE.companyId,
        correlationId: 'corr-1',
        eventId: '00000000-0000-4000-8000-0000000000cc',
        occurredAt: '2026-08-12T12:00:00.000Z',
        payload: {
          invitationId: '00000000-0000-4000-8000-0000000000bb',
          userId: '00000000-0000-4000-8000-0000000000aa',
        },
        type: 'transportada.identity.invitation.code.requested',
        version: 1,
      },
      {
        channels: gateway,
        envelopeProvider: { decrypt: async () => 'a1b2c3d4' },
        invitations: {
          findForDelivery: async () => ({
            companyId: MESSAGE.companyId,
            contactAddress: '5516999991234',
            contactChannel: 'whatsapp' as const,
            id: '00000000-0000-4000-8000-0000000000bb',
            sealedCode: { ciphertext: 'x' },
            userId: '00000000-0000-4000-8000-0000000000aa',
          }),
          markDelivered: async (input) => {
            delivered.push(input.invitationId)
          },
        },
        logger: { error: () => undefined, info: () => undefined },
      },
    )

    expect(whatsapp.calls[0]?.companyId).toBe(MESSAGE.companyId)
    expect(whatsapp.calls[0]?.code).toBe('a1b2c3d4')
    expect(delivered).toEqual(['00000000-0000-4000-8000-0000000000bb'])
  })
})
