/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4): o webhook do Evolution — quem passa pela porta (segredo do cabeçalho, por
 * empresa), o que vira mensagem ou status, e como o webhook é apontado para a API.
 */
import { describe, expect, test } from 'bun:test'
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { EvolutionConversationInbound } from '../../src/occurrence-conversation/application/evolution-conversation-inbound.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { createWhatsAppEvolutionSecretService } from '../../src/whatsapp/application/whatsapp-evolution-secret.service.js'
import type {
  WhatsAppEvolutionWebhookGatewayPort,
  WhatsAppEvolutionWebhookRegistration,
  WhatsAppEvolutionWebhookRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-evolution-webhook.port.js'
import { createWhatsAppEvolutionWebhookSecretService } from '../../src/whatsapp/application/whatsapp-evolution-webhook-secret.service.js'
import {
  createWhatsAppEvolutionWebhookUseCase,
  EVOLUTION_WEBHOOK_TOKEN_HEADER,
  webhookUrl,
} from '../../src/whatsapp/application/whatsapp-evolution-webhook.use-case.js'
import {
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
  WhatsAppEvolutionUnreachableError,
  WhatsAppEvolutionWebhookUrlMissingError,
} from '../../src/whatsapp/domain/whatsapp-evolution.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000009'
const SETTINGS_ID = '00000000-0000-4000-8000-000000000040'
const WEBHOOK_ID = '00000000-0000-4000-8000-0000000000aa'
const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as unknown as CompanyContext
const API_KEY = 'chave-secreta-da-instancia'
const TOKEN = 'segredo-do-webhook-da-empresa'
const PHONE = '5516999998888'
const TEXT = 'recebi o boleto, obrigado'
const API_PUBLIC_URL = 'https://api.exemplo.com/'
const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/** Cofre de mentira que respeita o AAD. */
function createFakeProvider(): SecretEnvelopeProvider {
  const vault = new Map<string, { aad: string; plaintext: string }>()
  let sequence = 0
  return {
    async decrypt({ additionalAuthenticatedData, envelope }) {
      const stored = vault.get(envelope.ciphertext)
      if (stored === undefined) throw new Error('unknown ciphertext')
      if (stored.aad !== TEXT_DECODER.decode(additionalAuthenticatedData)) {
        throw new Error('aad mismatch')
      }
      return TEXT_ENCODER.encode(stored.plaintext)
    },
    async encrypt({ additionalAuthenticatedData, plaintext }) {
      sequence += 1
      const ciphertext = `cipher-${sequence}`
      vault.set(ciphertext, {
        aad: TEXT_DECODER.decode(additionalAuthenticatedData),
        plaintext: TEXT_DECODER.decode(plaintext),
      })
      return {
        algorithm: 'A256GCM',
        ciphertext,
        keyId: 'key-1',
        nonce: 'nonce-1',
        version: 1,
      } satisfies SecretEnvelopeV1
    },
  }
}

type LogEntry = { level: string; message: string; fields: unknown }

async function setup(
  options: {
    apiPublicUrl?: string | undefined
    gatewayFails?: boolean
    instanceName?: string
    registeredAt?: Date | null
    status?: 'active' | 'disabled'
    withWebhookSecret?: boolean
  } = {},
) {
  const provider = createFakeProvider()
  const scope = { companyId: COMPANY_ID, settingsId: SETTINGS_ID }
  const apiKeySecrets = createWhatsAppEvolutionSecretService({ envelopeProvider: provider })
  let generated = 0
  const webhookSecrets = createWhatsAppEvolutionWebhookSecretService({
    envelopeProvider: provider,
    randomBytes: (length) => {
      generated += 1
      return new Uint8Array(length).fill(generated)
    },
  })
  const apiKeyEnvelope = await apiKeySecrets.encrypt({ ...scope, apiKey: API_KEY })
  let webhookEnvelope: SecretEnvelopeV1 | null =
    options.withWebhookSecret === false
      ? null
      : await webhookSecrets.encrypt({ ...scope, webhookToken: TOKEN })

  const state = {
    deliveries: [] as unknown[],
    findCalls: 0,
    gatewayCalls: [] as Parameters<WhatsAppEvolutionWebhookGatewayPort['setWebhook']>[0][],
    logs: [] as LogEntry[],
    marked: [] as unknown[],
    messages: [] as Parameters<EvolutionConversationInbound['receiveMessage']>[0][],
    registeredAt: options.registeredAt ?? null,
    statuses: [] as Parameters<EvolutionConversationInbound['receiveStatus']>[0][],
    stored: [] as SecretEnvelopeV1[],
  }
  const registration = (): WhatsAppEvolutionWebhookRegistration => ({
    apiKeyEnvelope,
    baseUrl: 'https://evolution.exemplo.com',
    instanceName: options.instanceName ?? 'transportada',
    registeredAt: state.registeredAt,
    settingsId: SETTINGS_ID,
    status: options.status ?? 'active',
    webhookEnvelope,
    webhookId: WEBHOOK_ID,
  })
  const repository: WhatsAppEvolutionWebhookRepositoryPort = {
    async findByWebhookId({ webhookId }) {
      state.findCalls += 1
      if (webhookId !== WEBHOOK_ID) return null
      const current = registration()
      return {
        companyId: COMPANY_ID,
        instanceName: current.instanceName,
        settingsId: SETTINGS_ID,
        status: current.status,
        webhookEnvelope: current.webhookEnvelope,
      }
    },
    async findRegistration({ companyId }) {
      return companyId === COMPANY_ID ? registration() : null
    },
    async markRegistered(input) {
      state.marked.push(input)
      state.registeredAt = new Date('2026-10-27T19:00:00.000Z')
      return state.registeredAt
    },
    async recordDelivery(input) {
      state.deliveries.push(input)
    },
    async storeSecret({ envelope }) {
      state.stored.push(envelope)
      webhookEnvelope = envelope
      state.registeredAt = null
    },
  }
  const logger = {
    error: (message: string, fields: unknown) =>
      state.logs.push({ fields, level: 'error', message }),
    info: (message: string, fields: unknown) => state.logs.push({ fields, level: 'info', message }),
    warn: (message: string, fields: unknown) => state.logs.push({ fields, level: 'warn', message }),
  } as unknown as ApiLogger
  const useCase = createWhatsAppEvolutionWebhookUseCase({
    apiKeySecrets,
    apiPublicUrl: 'apiPublicUrl' in options ? options.apiPublicUrl : API_PUBLIC_URL,
    gateway: {
      async setWebhook(input) {
        state.gatewayCalls.push(input)
        if (options.gatewayFails === true) throw new Error('evolution down')
      },
    },
    inbound: {
      async receiveMessage(input) {
        state.messages.push(input)
        return 'conversation'
      },
      async receiveStatus(input) {
        state.statuses.push(input)
      },
    },
    logger,
    repository,
    webhookSecrets,
  })
  return { state, useCase, webhookSecrets }
}

const upsert = (data: unknown, instance = 'transportada') =>
  JSON.stringify({ data, event: 'messages.upsert', instance })

const receiveWith = (overrides: {
  rawBody?: string
  token?: null | string
  webhookId?: string
}) => ({
  correlationId: 'corr-1',
  rawBody: overrides.rawBody ?? upsert({}),
  token: 'token' in overrides ? (overrides.token ?? null) : TOKEN,
  webhookId: overrides.webhookId ?? WEBHOOK_ID,
})

describe('webhook do Evolution: quem passa pela porta', () => {
  test('sem cabeçalho, ou com id que nem é uuid, recusa sem ir ao banco', async () => {
    const { state, useCase } = await setup()

    expect(await useCase.receive(receiveWith({ token: null }))).toEqual({ outcome: 'unauthorized' })
    expect(await useCase.receive(receiveWith({ token: '' }))).toEqual({ outcome: 'unauthorized' })
    expect(await useCase.receive(receiveWith({ webhookId: "1' or '1'='1" }))).toEqual({
      outcome: 'unauthorized',
    })
    expect(state.findCalls).toBe(0)
  })

  test('id desconhecido, empresa sem segredo e segredo errado dão a mesma recusa', async () => {
    const unknown = await setup()
    const withoutSecret = await setup({ withWebhookSecret: false })
    const wrong = await setup()

    const results = await Promise.all([
      unknown.useCase.receive(receiveWith({ webhookId: '00000000-0000-4000-8000-0000000000bb' })),
      withoutSecret.useCase.receive(receiveWith({})),
      wrong.useCase.receive(receiveWith({ token: `${TOKEN}x` })),
    ])

    expect(results).toEqual([
      { outcome: 'unauthorized' },
      { outcome: 'unauthorized' },
      { outcome: 'unauthorized' },
    ])
    expect(wrong.state.messages).toEqual([])
    expect(wrong.state.deliveries).toEqual([])
  })

  test('evento de outra instância é ignorado mesmo com o segredo certo', async () => {
    const { state, useCase } = await setup()

    const receipt = await useCase.receive(
      receiveWith({
        rawBody: upsert(
          {
            key: { id: 'M1', remoteJid: `${PHONE}@s.whatsapp.net` },
            message: { conversation: TEXT },
          },
          'outra-instancia',
        ),
      }),
    )

    expect(receipt).toEqual({ outcome: 'ignored' })
    expect(state.messages).toEqual([])
  })

  test('empresa com o Evolution desligado registra a entrega e não lê nada', async () => {
    const { state, useCase } = await setup({ status: 'disabled' })

    const receipt = await useCase.receive(
      receiveWith({
        rawBody: upsert({
          key: { id: 'M1', remoteJid: `${PHONE}@s.whatsapp.net` },
          message: { conversation: TEXT },
        }),
      }),
    )

    expect(receipt).toEqual({ outcome: 'ignored' })
    expect(state.messages).toEqual([])
    expect(state.deliveries).toEqual([{ companyId: COMPANY_ID }])
  })
})

describe('webhook do Evolution: o que a entrega vira', () => {
  test('a mensagem de uma pessoa vai para a conversa com o id citado; a própria, grupo e status não', async () => {
    const { state, useCase } = await setup()

    const receipt = await useCase.receive(
      receiveWith({
        rawBody: upsert([
          {
            key: { fromMe: false, id: 'M1', remoteJid: `${PHONE}@s.whatsapp.net` },
            message: { extendedTextMessage: { contextInfo: { stanzaId: 'SENT-1' }, text: TEXT } },
          },
          { key: { fromMe: true, id: 'M2', remoteJid: `${PHONE}@s.whatsapp.net` } },
          { key: { id: 'M3', remoteJid: '120363000000000000@g.us' } },
          { key: { id: 'M4', remoteJid: 'status@broadcast' } },
        ]),
      }),
    )

    expect(receipt).toEqual({ outcome: 'accepted' })
    expect(state.messages).toEqual([
      {
        companyId: COMPANY_ID,
        message: {
          from: PHONE,
          providerMessageId: 'M1',
          replyToProviderMessageId: 'SENT-1',
          text: TEXT,
        },
      },
    ])
    expect(state.deliveries).toEqual([{ companyId: COMPANY_ID }])
  })

  test('as confirmações viram o status da mensagem, na empresa do webhook', async () => {
    const { state, useCase } = await setup()

    for (const status of ['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'ERROR']) {
      await useCase.receive(
        receiveWith({
          rawBody: JSON.stringify({
            data: { keyId: 'SENT-1', status },
            event: 'messages.update',
            instance: 'transportada',
          }),
        }),
      )
    }

    expect(state.statuses).toEqual(
      (['sent', 'delivered', 'read', 'failed'] as const).map((status) => ({
        companyId: COMPANY_ID,
        providerMessageId: 'SENT-1',
        status,
      })),
    )
  })

  test('a mudança de conexão vira o último estado da instância', async () => {
    const { state, useCase } = await setup()

    await useCase.receive(
      receiveWith({
        rawBody: JSON.stringify({
          data: { state: 'close' },
          event: 'CONNECTION_UPDATE',
          instance: 'transportada',
        }),
      }),
    )

    expect(state.deliveries).toEqual([{ companyId: COMPANY_ID, connectionState: 'close' }])
  })

  test('corpo que não é JSON é ignorado sem erro', async () => {
    const { state, useCase } = await setup()

    expect(await useCase.receive(receiveWith({ rawBody: 'lixo' }))).toEqual({ outcome: 'ignored' })
    expect(state.messages).toEqual([])
  })

  test('nenhum log leva segredo, número ou texto', async () => {
    const { state, useCase } = await setup()

    await useCase.receive(receiveWith({ token: 'errado' }))
    await useCase.receive(
      receiveWith({
        rawBody: upsert({
          key: { id: 'M1', remoteJid: `${PHONE}@s.whatsapp.net` },
          message: { conversation: TEXT },
        }),
      }),
    )
    await useCase.register({ context: CONTEXT, correlationId: 'corr-2' })

    const serialized = JSON.stringify(state.logs)
    expect(state.logs.length).toBeGreaterThan(0)
    for (const forbidden of [TOKEN, 'errado', PHONE, TEXT, API_KEY, WEBHOOK_ID]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe('webhook do Evolution: apontar para a API', () => {
  test('a rota do dono troca o segredo e aponta a URL da empresa com ele no cabeçalho', async () => {
    const { state, useCase, webhookSecrets } = await setup()

    const result = await useCase.register({ context: CONTEXT, correlationId: 'corr-2' })

    expect(result).toEqual({ registeredAt: '2026-10-27T19:00:00.000Z' })
    expect(state.stored).toHaveLength(1)
    const [call] = state.gatewayCalls
    expect(call?.url).toBe(`https://api.exemplo.com/public/whatsapp-evolution/${WEBHOOK_ID}`)
    expect(call?.apiKey).toBe(API_KEY)
    const sent = call?.headers[EVOLUTION_WEBHOOK_TOKEN_HEADER]
    const stored = await webhookSecrets.decrypt({
      companyId: COMPANY_ID,
      envelope: state.stored[0] as SecretEnvelopeV1,
      settingsId: SETTINGS_ID,
    })
    expect(sent).toBe(stored.webhookToken)
    expect(sent).not.toBe(TOKEN)
    expect(state.marked).toEqual([
      {
        audit: {
          action: 'whatsapp-evolution.webhook.registered',
          actorUserId: USER_ID,
          correlationId: 'corr-2',
        },
        companyId: COMPANY_ID,
        rotated: true,
        settingsId: SETTINGS_ID,
      },
    ])

    // O segredo novo é o que passa a abrir a porta; o antigo deixa de abrir.
    expect(await useCase.receive(receiveWith({ token: sent ?? null }))).toEqual({
      outcome: 'accepted',
    })
    expect(await useCase.receive(receiveWith({ token: TOKEN }))).toEqual({
      outcome: 'unauthorized',
    })
  })

  test('sem configuração, desligado, sem endereço público ou com o Evolution fora dá erro tipado', async () => {
    const disabled = await setup({ status: 'disabled' })
    const withoutUrl = await setup({ apiPublicUrl: undefined })
    const down = await setup({ gatewayFails: true })
    const other = { companyId: '00000000-0000-4000-8000-000000000002', userId: USER_ID }

    await expect(
      disabled.useCase.register({
        context: other as unknown as CompanyContext,
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionNotConfiguredError)
    await expect(
      disabled.useCase.register({ context: CONTEXT, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionDisabledError)
    await expect(
      withoutUrl.useCase.register({ context: CONTEXT, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionWebhookUrlMissingError)
    await expect(
      down.useCase.register({ context: CONTEXT, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionUnreachableError)
    expect(down.state.marked).toEqual([])
  })

  test('o QR aponta uma vez, mantendo o segredo, e não aponta de novo nem falha por isso', async () => {
    const first = await setup()
    await first.useCase.ensureRegistered({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'c',
    })
    await first.useCase.ensureRegistered({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'c',
    })
    expect(first.state.gatewayCalls).toHaveLength(1)
    expect(first.state.gatewayCalls[0]?.headers[EVOLUTION_WEBHOOK_TOKEN_HEADER]).toBe(TOKEN)
    expect(first.state.stored).toEqual([])

    const fresh = await setup({ withWebhookSecret: false })
    await fresh.useCase.ensureRegistered({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'c',
    })
    expect(fresh.state.stored).toHaveLength(1)

    const down = await setup({ gatewayFails: true })
    await down.useCase.ensureRegistered({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'c',
    })
    expect(down.state.logs.map((entry) => entry.message)).toEqual([
      'whatsapp_evolution.webhook.register_failed',
    ])

    const withoutUrl = await setup({ apiPublicUrl: undefined })
    await withoutUrl.useCase.ensureRegistered({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'c',
    })
    expect(withoutUrl.state.gatewayCalls).toEqual([])
  })

  test('a URL junta o endereço público e o id, sem barra dobrada', () => {
    expect(webhookUrl('https://api.exemplo.com//', WEBHOOK_ID)).toBe(
      `https://api.exemplo.com/public/whatsapp-evolution/${WEBHOOK_ID}`,
    )
  })
})
