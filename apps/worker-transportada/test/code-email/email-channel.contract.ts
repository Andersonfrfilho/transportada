/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O canal de e-mail entrega o template, não um `<p>` com o corpo interpolado — era por ali que o
 * texto do cadastro chegaria cru ao HTML.
 */
import { describe, expect, test } from 'bun:test'

import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import { createInvitationChannelGateway } from '../../src/identity/infrastructure/invitation-channel.gateway.js'

const MESSAGE = {
  address: 'operador@exemplo.com.br',
  body: 'Seu código de ativação é 123456.',
  channel: 'email',
  code: '123456',
  companyId: '22222222-2222-4222-8222-222222222222',
  subject: 'Seu código de ativação',
} as const

function recordingEmailDriver() {
  const calls: Parameters<EmailDriverPort['send']>[0][] = []
  const driver = {
    send: async (request: Parameters<EmailDriverPort['send']>[0]) => {
      calls.push(request)
      return { outcome: 'sent' } as Awaited<ReturnType<EmailDriverPort['send']>>
    },
  } as unknown as EmailDriverPort

  return { calls, driver }
}

describe('o canal de e-mail do código de acesso', () => {
  test('o HTML sai do template, com a marca lida do cadastro', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({
      brand: {
        read: async () => ({
          accentColor: '#1a2b3c',
          appBaseUrl: 'https://painel.exemplo.com.br',
          contactEmail: 'contato@exemplo.com.br',
          contactPhone: '(16) 3333-4444',
          logoUrl: 'https://api.exemplo.com.br/public/landing-logo',
          name: 'Transportes Exemplo',
        }),
      },
      email: email.driver,
    })

    await gateway.send({
      ...MESSAGE,
      email: { intro: 'Use o código abaixo.', note: 'De uso único.' },
    })

    const [sent] = email.calls
    expect(sent?.to).toBe(MESSAGE.address)
    expect(sent?.html).toContain('Transportes Exemplo')
    expect(sent?.html).toContain('Ada Technology')
    expect(sent?.html).toContain(MESSAGE.code)
    expect(sent?.html).toContain('Use o código abaixo.')
    expect(sent?.html).not.toBe(`<p>${MESSAGE.body}</p>`)
    expect(sent?.text).toContain(MESSAGE.code)
  })

  test('sem porta de marca o envio continua, com a marca do produto', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({ email: email.driver })

    await gateway.send(MESSAGE)

    expect(email.calls[0]?.html).toContain('TransportAdA')
    expect(email.calls[0]?.html).toContain(MESSAGE.body)
  })
})
