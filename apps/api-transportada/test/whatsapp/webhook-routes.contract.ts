/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T006 — o webhook assinado da Meta.
 */
import { createHmac } from 'node:crypto'
import { describe, expect, test } from 'bun:test'

import { createWhatsAppWebhookRoutes } from '../../src/whatsapp/presentation/whatsapp-webhook.routes.js'
import type { MetaWhatsAppModuleResolver } from '../../src/whatsapp/application/meta-whatsapp-module.resolver.js'

const APP_SECRET = 'app-secret'
const VERIFY_TOKEN = 'verify-token'
const COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const PHONE_NUMBER_ID = '5551234'

const BODY = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [{ from: '5516999991234', text: { body: 'quero remarcar' } }],
            metadata: { phone_number_id: PHONE_NUMBER_ID },
          },
        },
      ],
    },
  ],
})

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function buildFixture(input: { readonly known?: boolean } = {}) {
  const logged: { message: string; meta?: unknown }[] = []
  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }
  const received: { companyId: string; rawBody: string }[] = []

  const resolver: MetaWhatsAppModuleResolver = {
    resolveByPhoneNumberId: async (phoneNumberId) =>
      input.known === false || phoneNumberId !== PHONE_NUMBER_ID
        ? undefined
        : ({
            companyId: COMPANY_ID,
            module: {
              webhook: {
                receive: {
                  execute: async (params: { companyId: string; rawBody: string }) => {
                    received.push({ companyId: params.companyId, rawBody: params.rawBody })

                    return {
                      accountEventsProcessed: 0,
                      duplicate: false,
                      ignoredForeignNumber: 0,
                      messagesProcessed: 1,
                      statusesProcessed: 0,
                      unhandledEvents: 0,
                    }
                  },
                },
              },
            },
          } as never),
  }

  const routes = createWhatsAppWebhookRoutes({
    appSecret: APP_SECRET,
    logger: {
      debug: record,
      error: record,
      info: record,
      warn: record,
    } as never,
    resolver,
    verifyToken: VERIFY_TOKEN,
  })

  const get = routes.find((route) => route.method === 'GET')
  const post = routes.find((route) => route.method === 'POST')
  if (get === undefined || post === undefined) throw new Error('routes not registered')

  return { get, logged, post, received }
}

async function postWebhook(
  fixture: ReturnType<typeof buildFixture>,
  input: { readonly body?: string; readonly signature?: string | null },
): Promise<Response> {
  const body = input.body ?? BODY
  const headers = new Headers()
  const signature = input.signature === undefined ? sign(body) : input.signature
  if (signature !== null) headers.set('x-hub-signature-256', signature)

  return fixture.post.execute({
    correlationId: 'corr-1',
    pathParameters: {},
    request: new Request('https://api.local/public/whatsapp/webhook', {
      body,
      headers,
      method: 'POST',
    }),
  })
}

describe('o webhook do WhatsApp (spec 062 T006)', () => {
  /**
   * ⚠️ **A regra que dá nome à task.** Sem os dois segredos do app a rota não existe — publicá-la e
   * conferir a assinatura "quando o segredo existir" transformaria configuração faltando numa porta
   * aberta, e a falha ficaria invisível: a Meta não reclama de um webhook que responde 200 a tudo.
   */
  test('sem segredo do app a rota não é registrada', () => {
    expect(
      createWhatsAppWebhookRoutes({
        appSecret: undefined,
        logger: {} as never,
        resolver: {} as never,
        verifyToken: VERIFY_TOKEN,
      }),
    ).toHaveLength(0)
    expect(
      createWhatsAppWebhookRoutes({
        appSecret: APP_SECRET,
        logger: {} as never,
        resolver: {} as never,
        verifyToken: undefined,
      }),
    ).toHaveLength(0)
  })

  test('corpo assinado chega ao módulo com a empresa do número', async () => {
    const fixture = buildFixture()

    const response = await postWebhook(fixture, {})

    expect(response.status).toBe(200)
    expect(fixture.received).toEqual([{ companyId: COMPANY_ID, rawBody: BODY }])
  })

  /** Payload adulterado é rejeitado — critério de aceite da spec. */
  test('corpo adulterado depois de assinado é recusado', async () => {
    const fixture = buildFixture()

    const response = await postWebhook(fixture, {
      body: BODY.replace('remarcar', 'cancelar'),
      signature: sign(BODY),
    })

    expect(response.status).toBe(403)
    expect(fixture.received).toHaveLength(0)
  })

  test('assinatura de outro segredo é recusada', async () => {
    const fixture = buildFixture()

    const response = await postWebhook(fixture, { signature: sign(BODY, 'outro-segredo') })

    expect(response.status).toBe(403)
    expect(fixture.received).toHaveLength(0)
  })

  test('sem cabeçalho de assinatura é recusado, não aceito em silêncio', async () => {
    const fixture = buildFixture()

    const response = await postWebhook(fixture, { signature: null })

    expect(response.status).toBe(403)
    expect(fixture.received).toHaveLength(0)
  })

  /**
   * ⚠️ Número desconhecido **não** vira erro: a Meta desativa webhook que responde erro, e um número
   * de outra WABA derrubaria a entrega de todos os outros junto.
   */
  test('número que a instalação não conhece responde 200 e não chega ao módulo', async () => {
    const fixture = buildFixture({ known: false })

    const response = await postWebhook(fixture, {})

    expect(response.status).toBe(200)
    expect(fixture.received).toHaveLength(0)
  })

  test('corpo assinado sem número não derruba a rota', async () => {
    const fixture = buildFixture()
    const body = JSON.stringify({ entry: [{ changes: [{ value: {} }] }] })

    const response = await postWebhook(fixture, { body, signature: sign(body) })

    expect(response.status).toBe(200)
  })

  /**
   * ⚠️ **Nada de conteúdo de mensagem em log, em nenhum nível** (`security.md` §1). O texto do
   * cliente passa pela rota inteira e não pode aparecer em lugar nenhum do que ela registra.
   */
  test('o que o cliente escreveu não aparece em log nenhum', async () => {
    const fixture = buildFixture()

    await postWebhook(fixture, {})
    await postWebhook(fixture, { signature: null })

    const serialized = JSON.stringify(fixture.logged)
    expect(serialized).not.toContain('remarcar')
    expect(serialized).not.toContain('5516999991234')
  })

  test('o desafio de verificação devolve o challenge em texto puro', async () => {
    const fixture = buildFixture()

    const response = await fixture.get.execute({
      correlationId: 'corr-1',
      pathParameters: {},
      request: new Request(
        `https://api.local/public/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234`,
      ),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('1234')
  })

  test('desafio com token errado é recusado, e não devolve o challenge', async () => {
    const fixture = buildFixture()

    const response = await fixture.get.execute({
      correlationId: 'corr-1',
      pathParameters: {},
      request: new Request(
        'https://api.local/public/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1234',
      ),
    })

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('')
  })

  /** As duas rotas declaram teto: pública sem limite é alvo (`security.md` §3). */
  test('as duas rotas públicas declaram limite de taxa', () => {
    const fixture = buildFixture()

    expect(fixture.get.rateLimit).toBeDefined()
    expect(fixture.post.rateLimit).toBeDefined()
  })
})
