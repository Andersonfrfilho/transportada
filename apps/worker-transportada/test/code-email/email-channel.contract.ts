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
          apiBaseUrl: 'https://api.exemplo.com.br',
          appBaseUrl: 'https://painel.exemplo.com.br',
          contacts: [],
          contactEmail: 'contato@exemplo.com.br',
          contactPhone: '(16) 3333-4444',
          logoUrl: 'https://api.exemplo.com.br/public/landing-logo',
          socialLinks: [],
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

  /**
   * ⚠️ A fiação, que é o que quebra em silêncio: sem pessoa no cabeçalho o gateway tem de **buscar**
   * a identificação legal, e com pessoa não pode buscar. Um `renderCodeEmail` correto com a consulta
   * no lugar errado dá e-mail de sistema sem CNPJ, e consulta a mais em todo convite.
   */
  test('o envio do sistema busca a identificação legal; o de usuário não', async () => {
    const lookups: string[] = []
    const legal = {
      find: async (input: { readonly companyId: string }) => {
        lookups.push(input.companyId)
        return {
          city: 'RIBEIRAO PRETO',
          complement: '',
          district: 'INDEPENDENCIA',
          email: 'contato@tapetemagico.com.br',
          phone: '1691225783',
          legalName: 'TAPETE MAGICO TRANSPORTADORA LTDA',
          number: '2296',
          postalCode: '14076400',
          state: 'SP',
          street: 'MOGIANA',
          taxId: '12345678000195',
        }
      },
    }
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({ email: email.driver, legal })

    await gateway.send(MESSAGE)
    expect(lookups).toEqual([MESSAGE.companyId])
    expect(email.calls[0]?.html).toContain('CNPJ 12.345.678/0001-95')

    await gateway.send({
      ...MESSAGE,
      recipient: { name: 'Ana Souza', pictureToken: undefined },
    })
    expect(lookups).toEqual([MESSAGE.companyId])
    expect(email.calls[1]?.html).not.toContain('CNPJ')
  })

  test('sem porta de marca o envio continua, com a marca do produto', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({ email: email.driver })

    await gateway.send(MESSAGE)

    expect(email.calls[0]?.html).toContain('TransportAdA')
    expect(email.calls[0]?.html).toContain(MESSAGE.body)
  })
})
