/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O convite chegava só com o código, e nenhuma tela do produto sabia recebê-lo: em 25/09/2026 a
 * pessoa tentou usar o código como senha no login. O e-mail agora leva à tela de ativação com o
 * código já preenchido — no fragmento (`#`), que o navegador nunca manda a servidor nenhum.
 */
import { describe, expect, test } from 'bun:test'

import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import { createInvitationChannelGateway } from '../../src/identity/infrastructure/invitation-channel.gateway.js'

const CODE = '1e45fbd07992c00a'
const APP_BASE_URL = 'https://app.exemplo.com.br/'
const ACTIVATION_URL = `https://app.exemplo.com.br/ativar#codigo=${CODE}`

const MESSAGE = {
  address: 'motorista@exemplo.com.br',
  body: `Seu código de ativação é ${CODE}.`,
  channel: 'email',
  code: CODE,
  companyId: '22222222-2222-4222-8222-222222222222',
  subject: 'Seu código de ativação',
} as const

function brandWith(appBaseUrl: string | undefined) {
  return {
    read: async () => ({
      accentColor: undefined,
      apiBaseUrl: undefined,
      appBaseUrl,
      contacts: [],
      contactEmail: undefined,
      contactPhone: undefined,
      logoUrl: undefined,
      name: undefined,
      socialLinks: [],
    }),
  }
}

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

const ACTIVATION_EMAIL = {
  action: { label: 'Ativar meu acesso', path: '/ativar' },
  intro: 'Toque no botão para ativar seu acesso.',
  note: 'De uso único.',
} as const

describe('o link de ativação no e-mail do convite', () => {
  test('leva à tela de ativação com o código no fragmento', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({
      brand: brandWith(APP_BASE_URL),
      email: email.driver,
    })

    await gateway.send({ ...MESSAGE, email: ACTIVATION_EMAIL })

    const [sent] = email.calls
    expect(sent?.html).toContain(`href="${ACTIVATION_URL}"`)
    expect(sent?.html).toContain('Ativar meu acesso')
    expect(sent?.text).toContain(ACTIVATION_URL)
    expect(sent?.html).toContain(CODE)
  })

  /** Sem a origem do painel não há link que funcione: o código continua lá, e o e-mail sai igual. */
  test('sem a origem do painel o e-mail sai só com o código', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({
      brand: brandWith(undefined),
      email: email.driver,
    })

    await gateway.send({ ...MESSAGE, email: ACTIVATION_EMAIL })

    const [sent] = email.calls
    expect(sent?.html).not.toContain('/ativar')
    expect(sent?.html).toContain(CODE)
  })

  /** A recuperação de senha usa a mesma moldura e não pede botão: ela continua como era. */
  test('e-mail sem ação não ganha botão', async () => {
    const email = recordingEmailDriver()
    const gateway = createInvitationChannelGateway({
      brand: brandWith(APP_BASE_URL),
      email: email.driver,
    })

    await gateway.send({ ...MESSAGE, email: { intro: 'Use o código.', note: '' } })

    expect(email.calls[0]?.html).not.toContain('/ativar')
  })
})
