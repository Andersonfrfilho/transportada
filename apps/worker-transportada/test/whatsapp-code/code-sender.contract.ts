/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T005 — o remetente de código pela Graph API.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
  createWhatsAppCodeSender,
  WhatsAppChannelNotConfiguredError,
  WhatsAppRecipientInvalidError,
} from '../../src/whatsapp/infrastructure/whatsapp-code-sender.gateway.js'

const originalFetch = globalThis.fetch
const COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const ENVELOPE = { ciphertext: 'cipher' }

afterEach(() => {
  globalThis.fetch = originalFetch
})

function stubGraphApi(): { readonly calls: { body: unknown; url: string }[] } {
  const calls: { body: unknown; url: string }[] = []
  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    calls.push({
      body: init?.body === undefined ? undefined : JSON.parse(init.body),
      url: String(input),
    })

    return new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }) as typeof globalThis.fetch

  return { calls }
}

function buildSender(input: {
  readonly credential?: { channelId: string; envelope: unknown; phoneNumberId: string } | undefined
  readonly template?: { languageCode: string; name: string } | undefined
}) {
  const opened: { channelId: string; companyId: string }[] = []

  const sender = createWhatsAppCodeSender({
    apiVersion: 'v23.0',
    baseUrl: 'https://graph.local',
    channels: {
      findActiveCredential: async () =>
        input.credential === undefined
          ? undefined
          : {
              channelId: input.credential.channelId,
              envelope: input.credential.envelope,
              phoneNumberId: input.credential.phoneNumberId,
            },
    },
    secrets: {
      decrypt: async (request) => {
        opened.push({ channelId: request.channelId, companyId: request.companyId })

        return 'meta-token'
      },
    },
    template: input.template,
  })

  return { opened, sender }
}

const CREDENTIAL = { channelId: 'c1', envelope: ENVELOPE, phoneNumberId: '5551234' }

describe('o remetente de código por WhatsApp (spec 062 T005)', () => {
  /**
   * ⚠️ **O caminho de produção é o template.** A Meta recusa mensagem livre para quem não escreveu
   * para o número nas últimas 24 h — e quem recebe um convite nunca escreveu.
   */
  test('com template configurado o código vai como parâmetro, não como texto livre', async () => {
    const graph = stubGraphApi()
    const { opened, sender } = buildSender({
      credential: CREDENTIAL,
      template: { languageCode: 'pt_BR', name: 'codigo_ativacao' },
    })

    await sender.send({
      address: '+55 (16) 99999-1234',
      body: 'Seu código de ativação é 123456.',
      code: '123456',
      companyId: COMPANY_ID,
    })

    expect(graph.calls[0]?.body).toMatchObject({ to: '5516999991234', type: 'template' })
    expect(JSON.stringify(graph.calls[0]?.body)).toContain('123456')
    /** O AAD amarra o selo ao par empresa+canal — abrir com outro par não abriria. */
    expect(opened).toEqual([{ channelId: 'c1', companyId: COMPANY_ID }])
  })

  test('sem template o envio cai em texto livre, que só vale dentro da janela de 24 h', async () => {
    const graph = stubGraphApi()
    const { sender } = buildSender({ credential: CREDENTIAL, template: undefined })

    await sender.send({
      address: '5516999991234',
      body: 'Seu código de ativação é 123456.',
      code: '123456',
      companyId: COMPANY_ID,
    })

    expect(graph.calls[0]?.body).toMatchObject({ type: 'text' })
  })

  /** Empresa sem canal é recusa nomeada, e o chaveiro nem é chamado. */
  test('empresa sem canal ativo não envia, e o segredo não é aberto', async () => {
    stubGraphApi()
    const { opened, sender } = buildSender({ credential: undefined })

    await expect(
      sender.send({ address: '5516999991234', body: 'x', code: '1', companyId: COMPANY_ID }),
    ).rejects.toBeInstanceOf(WhatsAppChannelNotConfiguredError)
    expect(opened).toHaveLength(0)
  })

  test('a versão configurada e o número do canal entram no caminho da chamada', async () => {
    const graph = stubGraphApi()
    const { sender } = buildSender({ credential: CREDENTIAL })

    await sender.send({ address: '5516999991234', body: 'x', code: '1', companyId: COMPANY_ID })

    expect(graph.calls[0]?.url).toContain('/v23.0/5551234/')
  })
})

/**
 * O cadastro guarda o telefone com 10 ou 11 dígitos, sem o `55`, e o convite pode gravar o contato
 * como foi digitado. A Meta quer o número com país: sem ele, `16999991234` sai para outro lugar.
 */
describe('o destinatário do código ganha o país (spec 062 T005)', () => {
  const CANONICAL_RECIPIENTS: ReadonlyArray<readonly [string, string, string]> = [
    ['fixo sem país, 10 dígitos', '1633334444', '551633334444'],
    ['celular sem país, 11 dígitos', '16999991234', '5516999991234'],
    ['fixo que já vem com 55, 12 dígitos', '551633334444', '551633334444'],
    ['celular que já vem com 55, 13 dígitos', '5516999991234', '5516999991234'],
    ['+55 com máscara', '+55 (16) 99999-1234', '5516999991234'],
    ['máscara sem país', '(16) 99999-1234', '5516999991234'],
  ]

  for (const [label, address, recipient] of CANONICAL_RECIPIENTS) {
    test(`${label}: ${JSON.stringify(address)} sai como ${recipient}`, async () => {
      const graph = stubGraphApi()
      const { sender } = buildSender({ credential: CREDENTIAL })

      await sender.send({ address, body: 'x', code: '1', companyId: COMPANY_ID })

      expect(graph.calls[0]?.body).toMatchObject({ to: recipient })
    })
  }

  const REJECTED_RECIPIENTS: ReadonlyArray<readonly [string, string]> = [
    ['vazio', ''],
    ['só espaço', '   '],
    ['lixo', 'abc'],
    ['curto demais', '123'],
    ['outro país', '441633334444'],
  ]

  for (const [label, address] of REJECTED_RECIPIENTS) {
    test(`${label}: ${JSON.stringify(address)} é recusado sem enviar nem abrir o segredo`, async () => {
      const graph = stubGraphApi()
      const { opened, sender } = buildSender({ credential: CREDENTIAL })

      await expect(
        sender.send({ address, body: 'x', code: '1', companyId: COMPANY_ID }),
      ).rejects.toBeInstanceOf(WhatsAppRecipientInvalidError)
      expect(graph.calls).toHaveLength(0)
      expect(opened).toHaveLength(0)
    })
  }

  /** O endereço é PII (`security.md` §1): a recusa nomeia a empresa, nunca o número. */
  test('a recusa não carrega o endereço na mensagem', async () => {
    stubGraphApi()
    const { sender } = buildSender({ credential: CREDENTIAL })

    const failure = await sender
      .send({ address: '16a99991234', body: 'x', code: '1', companyId: COMPANY_ID })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(WhatsAppRecipientInvalidError)
    expect(String((failure as Error).message)).not.toContain('99991234')
  })
})
