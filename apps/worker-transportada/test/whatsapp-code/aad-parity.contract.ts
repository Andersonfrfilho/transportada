/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T005 — o AAD do envelope, palavra por palavra igual ao da API.
 *
 * ⚠️ Quem **sela** o token é a API, na rota de configuração; quem o **abre** é este worker, no envio.
 * As duas apps não importam código uma da outra, então a única coisa que impede a divergência é este
 * teste. Divergiu de um lado e o envelope não abre do outro — e a falha aparece só no primeiro
 * convite por WhatsApp, com o cliente do outro lado esperando.
 */
import { describe, expect, test } from 'bun:test'

const API_SOURCE = new URL(
  '../../../api-transportada/src/whatsapp/application/whatsapp-channel-secret.service.ts',
  import.meta.url,
)
const WORKER_SOURCE = new URL(
  '../../src/whatsapp/infrastructure/whatsapp-channel-secret.gateway.ts',
  import.meta.url,
)

const AAD_TEMPLATE = 'transportada:whatsapp-channel:v1:${input.companyId}:${input.channelId}'
const WORKER_AAD_TEMPLATE =
  'transportada:whatsapp-channel:v1:${request.companyId}:${request.channelId}'

describe('a paridade do AAD do canal de WhatsApp (spec 062 T005)', () => {
  test('a API sela com o AAD amarrado ao par empresa+canal', async () => {
    const source = await Bun.file(API_SOURCE).text()

    expect(source).toContain(AAD_TEMPLATE)
  })

  test('o worker abre com exatamente o mesmo AAD', async () => {
    const source = await Bun.file(WORKER_SOURCE).text()

    expect(source).toContain(WORKER_AAD_TEMPLATE)
    /** Mesmo prefixo literal nos dois: a diferença é só o nome da variável local. */
    expect(WORKER_AAD_TEMPLATE.split('${')[0]).toBe(AAD_TEMPLATE.split('${')[0])
  })
})
