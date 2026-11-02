/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { EmailDriverPort, SendEmailParams } from '@adatechnology/notification-contracts'
import { STANDARD_EMAIL_BUILTIN_TEMPLATE } from '@adatechnology/notification-contracts'

import {
  createStandardEmailBrandingResolver,
  withStandardEmailLayout,
} from '../../src/notification/infrastructure/standard-email-layout.driver.js'

const BRANDING = { displayName: 'Transportes Exemplo', template: STANDARD_EMAIL_BUILTIN_TEMPLATE }

function createFixture(resolveBranding = async () => BRANDING) {
  const sent: SendEmailParams[] = []
  const driver: EmailDriverPort = {
    driver: 'resend',
    send: async (params) => {
      sent.push(params)
      return { outcome: 'sent' } as never
    },
  }
  return { sent, wrapped: withStandardEmailLayout({ driver, resolveBranding }) }
}

describe('modelo padrão nos e-mails do módulo de notificação', () => {
  test('o texto do catálogo sai no modelo padrão, com a marca da empresa e o rodapé do produto', async () => {
    const { sent, wrapped } = createFixture()

    await wrapped.send({
      html: 'O certificado vence em 10/11/2026.<br>Envie o novo.',
      subject: 'Certificado digital vence em 10 dias',
      text: 'O certificado vence em 10/11/2026.\nEnvie o novo.',
      to: 'a@b.com',
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('Certificado digital vence em 10 dias')
    expect(sent[0]?.html).toContain('<table')
    expect(sent[0]?.html).toContain('O certificado vence em 10/11/2026.')
    expect(sent[0]?.html).toContain('Transportes Exemplo')
    expect(sent[0]?.html).toContain('Ada Technology')
    expect(sent[0]?.html).toContain(`© ${new Date().getFullYear()} Ada Technology`)
    expect(sent[0]?.text).toContain('O certificado vence em 10/11/2026.')
    expect(sent[0]?.text).toContain('Ada Technology')
  })

  test('texto com sinais de menor e maior continua texto, e vai escapado no layout', async () => {
    const { sent, wrapped } = createFixture()

    await wrapped.send({
      html: 'Valor &lt;10 &amp; &gt;5',
      subject: 's',
      text: 'Valor <10 & >5',
      to: 'a@b.com',
    })

    expect(sent[0]?.html).toContain('Valor &lt;10 &amp; &gt;5')
    expect(sent[0]?.html).not.toContain('Valor <10')
  })

  test('mensagem que já veio em HTML passa intacta', async () => {
    const { sent, wrapped } = createFixture()
    const params = {
      html: '<table><tr><td>Convite</td></tr></table>',
      subject: 's',
      text: 'Convite',
      to: 'a@b.com',
    }

    await wrapped.send(params)

    expect(sent[0]).toEqual(params)
  })

  test('sem conseguir resolver a marca, o e-mail sai no modelo embutido com o nome do produto', async () => {
    const { sent, wrapped } = createFixture(async () => {
      throw new Error('db fora do ar')
    })

    await wrapped.send({ html: 'Oi', subject: 's', text: 'Oi', to: 'a@b.com' })

    expect(sent[0]?.html).toContain('TransportAdA')
    expect(sent[0]?.html).toContain('Ada Technology')
  })
})

describe('marca e modelo da instalação', () => {
  function runnerReturning(...answers: readonly (readonly Record<string, unknown>[])[]) {
    let call = 0
    return { execute: async () => answers[call++] ?? [] }
  }

  test('sem ficha fiscal vale o nome do produto e o modelo embutido', async () => {
    const branding = await createStandardEmailBrandingResolver(runnerReturning([]))()

    expect(branding.displayName).toBe('TransportAdA')
    expect(branding.template).toBe(STANDARD_EMAIL_BUILTIN_TEMPLATE)
  })

  test('o nome segue a escolha da empresa e o modelo da empresa inutilizável cai no embutido', async () => {
    const branding = await createStandardEmailBrandingResolver(
      runnerReturning(
        [
          {
            company_id: '11111111-1111-4111-8111-111111111111',
            display_name_mode: 'legal_name',
            legal_name: 'Razão Ltda',
            trade_name: 'Fantasia',
          },
        ],
        [{ body: '<p>sem as variáveis obrigatórias</p>', version: 3 }],
      ),
    )()

    expect(branding.displayName).toBe('Razão Ltda')
    expect(branding.template).toBe(STANDARD_EMAIL_BUILTIN_TEMPLATE)
  })
})
