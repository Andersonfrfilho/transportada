/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T004 — o gateway entre o provider da Meta e a forma do `notification-contracts`. O que se
 * prova aqui é a **tradução**, que é onde os dois pacotes discordam: nome do id da mensagem e forma
 * do telefone.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { createMetaWhatsAppSendingChannel } from '../../src/whatsapp/infrastructure/meta-whatsapp-sending.gateway.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function stubGraphApi(): { readonly calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = []
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

function buildChannel() {
  return createMetaWhatsAppSendingChannel({
    accessToken: 'token',
    apiVersion: 'v23.0',
    baseUrl: 'https://graph.local',
    phoneNumberId: '5551234',
  })
}

describe('o gateway de envio da Meta (spec 062 T004)', () => {
  test('o id da mensagem da Meta vira o `externalMessageId` que o contrato lê', async () => {
    stubGraphApi()

    const result = await buildChannel().sendText('5516999991234', 'oi')

    expect(result).toEqual({ externalMessageId: 'wamid.ABC' })
  })

  /**
   * ⚠️ O telefone do cadastro é digitado por gente — `+55 (16) 99999-1234` é a forma normal. Mandá-lo
   * cru faz a Graph API recusar com um erro que parece de credencial, e o operador vai conferir o
   * token quando o defeito estava no traço.
   */
  test('o telefone vai em E.164 sem `+` e sem pontuação', async () => {
    const graph = stubGraphApi()

    await buildChannel().sendText('+55 (16) 99999-1234', 'oi')

    expect(graph.calls[0]?.body).toMatchObject({ to: '5516999991234' })
  })

  test('a mesma normalização vale para o envio por template', async () => {
    const graph = stubGraphApi()

    await buildChannel().sendTemplate({
      languageCode: 'pt_BR',
      templateName: 'convite',
      to: '+55 16 99999-1234',
    })

    expect(graph.calls[0]?.body).toMatchObject({ to: '5516999991234' })
  })

  /** A versão da Graph API é configuração, e ela envelhece — o caminho tem de carregá-la. */
  test('a versão configurada entra no caminho da chamada', async () => {
    const graph = stubGraphApi()

    await buildChannel().sendText('5516999991234', 'oi')

    expect(graph.calls[0]?.url).toContain('/v23.0/5551234/')
  })
})
