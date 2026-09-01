/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T004 — o driver que o `notification-module` injeta em `channels.whatsapp`.
 */
import { describe, expect, test } from 'bun:test'

import type {
  WhatsAppChannelCredential,
  WhatsAppChannelRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-channel.port.js'
import type { WhatsAppChannelSecretService } from '../../src/whatsapp/application/whatsapp-channel-secret.service.js'
import { createWhatsAppNotificationDriver } from '../../src/whatsapp/application/whatsapp-notification-driver.service.js'

const ENVELOPE = {
  algorithm: 'A256GCM',
  ciphertext: 'cipher',
  keyId: 'key',
  nonce: 'nonce',
  version: 1,
} as const

function credential(overrides: Partial<WhatsAppChannelCredential> = {}): WhatsAppChannelCredential {
  return {
    channelId: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    envelope: ENVELOPE,
    phoneNumberId: '5551234',
    ...overrides,
  }
}

function buildFixture(input: {
  readonly credentials: readonly WhatsAppChannelCredential[]
  readonly decryptFails?: boolean
  readonly sendFails?: unknown
}) {
  const warnings: string[] = []
  const sent: { to: string; body?: string; templateName?: string }[] = []
  const opened: { channelId: string; companyId: string }[] = []

  const repository: Pick<WhatsAppChannelRepositoryPort, 'findActiveCredentials'> = {
    findActiveCredentials: async () => input.credentials,
  }
  const secretService: WhatsAppChannelSecretService = {
    decrypt: async (request) => {
      if (input.decryptFails === true) throw new Error('keyring down')
      opened.push({ channelId: request.channelId, companyId: request.companyId })

      return { accessToken: `token-for-${request.channelId}` }
    },
    encrypt: async () => ENVELOPE,
  }

  const driver = createWhatsAppNotificationDriver({
    buildChannel: (channel) => ({
      sendText: async (to, body) => {
        if (input.sendFails !== undefined) throw input.sendFails
        sent.push({ body, to })

        return { externalMessageId: `wamid-${channel.phoneNumberId}` }
      },
      sendTemplate: async (params) => {
        if (input.sendFails !== undefined) throw input.sendFails
        sent.push({ templateName: params.templateName, to: params.to })

        return { externalMessageId: 'wamid-template' }
      },
    }),
    logger: { warn: (message) => warnings.push(message) },
    repository,
    secretService,
  })

  return { driver, opened, sent, warnings }
}

describe('o driver de WhatsApp do módulo de notificação (spec 062 T004)', () => {
  test('abre o envelope da empresa e entrega a mensagem livre ao canal', async () => {
    const fixture = buildFixture({ credentials: [credential()] })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result).toEqual({ outcome: 'sent', providerMessageId: 'wamid-5551234' })
    expect(fixture.sent).toEqual([{ body: 'oi', to: '5516999991234' }])
    /** O AAD amarra o selo ao par empresa+canal — abrir com outro par não abriria. */
    expect(fixture.opened).toEqual([
      {
        channelId: '11111111-1111-4111-8111-111111111111',
        companyId: '22222222-2222-4222-8222-222222222222',
      },
    ])
  })

  test('mensagem com template aprovado sai por template, não por texto livre', async () => {
    const fixture = buildFixture({ credentials: [credential()] })

    const result = await fixture.driver.send({
      body: 'ignorado',
      template: { languageCode: 'pt_BR', templateName: 'convite' },
      to: '5516999991234',
    })

    expect(result.outcome).toBe('sent')
    expect(fixture.sent).toEqual([{ templateName: 'convite', to: '5516999991234' }])
  })

  /**
   * Instalação sem canal é o caso normal, não defeito — nem toda transportadora usa WhatsApp. O
   * segredo nem chega a ser aberto.
   */
  test('sem canal cadastrado a entrega é recusada, e o chaveiro nem é chamado', async () => {
    const fixture = buildFixture({ credentials: [] })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result).toEqual({ errorCode: 'channel_not_configured', outcome: 'permanent' })
    expect(fixture.opened).toHaveLength(0)
  })

  /**
   * ⚠️ **O coração desta task.** Duas empresas com canal, e o driver não recebe empresa nenhuma:
   * escolher uma mandaria a mensagem do cliente pelo número da outra filial, e ele responderia
   * para lá. Recusar é a única saída honesta enquanto `SendWhatsAppParams` não carregar a empresa.
   */
  test('com dois canais ativos o driver recusa em vez de escolher um número', async () => {
    const fixture = buildFixture({
      credentials: [
        credential(),
        credential({
          channelId: '33333333-3333-4333-8333-333333333333',
          companyId: '44444444-4444-4444-8444-444444444444',
          phoneNumberId: '5555678',
        }),
      ],
    })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result).toEqual({ errorCode: 'channel_ambiguous', outcome: 'permanent' })
    expect(fixture.sent).toHaveLength(0)
    expect(fixture.warnings).toContain('whatsapp.driver.channel_ambiguous')
  })

  /**
   * Chaveiro fora do ar é indisponibilidade de minutos. `permanent` aqui queimaria a notificação,
   * e notificação queimada não volta — a fila já a deu por resolvida.
   */
  test('envelope que não abre é para tentar de novo, não para desistir', async () => {
    const fixture = buildFixture({ credentials: [credential()], decryptFails: true })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result).toEqual({ errorCode: 'channel_unavailable', outcome: 'retriable' })
    expect(fixture.warnings).toContain('whatsapp.driver.envelope_unreadable')
  })

  /**
   * O gateway não engole erro justamente para isto: quem classifica é o driver do pacote, que lê
   * o `code` da Graph API. `131026` é destino que não recebe WhatsApp — apagar o destino, não
   * insistir nele.
   */
  test('a falha da Graph API chega classificada pelo driver do pacote', async () => {
    const invalidTarget = Object.assign(new Error('not a whatsapp user'), { code: 131_026 })
    const fixture = buildFixture({ credentials: [credential()], sendFails: invalidTarget })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result.outcome).toBe('invalid_target')
    expect(result).toMatchObject({ errorCode: 'meta_131026' })
  })

  test('erro sem código nenhum vira nova tentativa, não desistência', async () => {
    const fixture = buildFixture({
      credentials: [credential()],
      sendFails: new Error('ECONNRESET'),
    })

    const result = await fixture.driver.send({ body: 'oi', to: '5516999991234' })

    expect(result).toEqual({ errorCode: 'unknown', outcome: 'retriable' })
  })
})
