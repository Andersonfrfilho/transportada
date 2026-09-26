/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHmac } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import {
  createProcessInboundEmailWebhookUseCase,
  type OccurrenceMailStatusPort,
} from '../../src/contractor-mail/application/process-inbound-email-webhook.use-case.js'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  RecordContractorMailInboundWebhookEventInput,
} from '../../src/contractor-mail/application/contractor-mail.port.js'
import type { ContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service.js'

const NOW = new Date('2026-09-13T12:00:00.000Z')
const SECRET_KEY = Buffer.from('use-case-webhook-secret-key-0000000', 'utf8')
const WEBHOOK_SIGNING_SECRET = `whsec_${SECRET_KEY.toString('base64')}`
const WEBHOOK_ID = '00000000-0000-4000-8000-0000000000d1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000000d2'
const SETTINGS_ID = '00000000-0000-4000-8000-0000000000d3'
const SVIX_ID = 'msg_process_webhook_use_case'
const SVIX_TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

const SETTINGS: ContractorMailSettingsRecord = {
  companyId: COMPANY_ID,
  id: SETTINGS_ID,
  lastWebhookAt: undefined,
  replyDomain: 'resposta.example.com.br',
  secretEnvelope: { synthetic: true },
  senderAddress: 'ocorrencias@example.com.br',
  senderName: 'Example',
  sendingVerifiedAt: undefined,
  status: 'active',
  version: 1n,
  webhookId: WEBHOOK_ID,
}

function sign(body: string): string {
  const signature = createHmac('sha256', SECRET_KEY)
    .update(`${SVIX_ID}.${SVIX_TIMESTAMP}.${body}`)
    .digest('base64')
  return `v1,${signature}`
}

function buildRepository(input: { readonly settings?: ContractorMailSettingsRecord | undefined }): {
  readonly recordedEvents: RecordContractorMailInboundWebhookEventInput[]
  readonly repository: ContractorMailRepositoryPort
} {
  const recordedEvents: RecordContractorMailInboundWebhookEventInput[] = []
  const settings = input.settings === undefined ? undefined : input.settings

  const repository: ContractorMailRepositoryPort = {
    async createContractorContact() {
      throw new Error('not used in this contract')
    },
    async listContractorContacts() {
      return []
    },
    async findContractorContact() {
      return undefined
    },
    async updateContractorContact() {
      throw new Error('not used in this contract')
    },
    async findSettings() {
      return settings
    },
    async findSettingsByWebhookId({ webhookId }) {
      return settings !== undefined && settings.webhookId === webhookId ? settings : undefined
    },
    async findSetupTestStatus() {
      return undefined
    },
    async findThreadByReplyTokenHash() {
      return undefined
    },
    async recordInboundWebhookEvent(event) {
      recordedEvents.push(event)
    },
    async recordSendingVerification() {
      throw new Error('not used by this contract')
    },
    async recordTestEmailMessage() {
      throw new Error('not used by this contract')
    },
    async reserveSetupTestThread() {
      throw new Error('not used by this contract')
    },
    async saveSettings() {
      throw new Error('not used by this contract')
    },
  }
  return { recordedEvents, repository }
}

const secretService: ContractorMailCredentialSecretService = {
  async decrypt() {
    return {
      apiKey: 'synthetic-api-key',
      replyTokenSecret: 'a'.repeat(64),
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    }
  },
  async encrypt() {
    throw new Error('not used by this contract')
  },
}

describe('process inbound email webhook use case (spec 143, T010)', () => {
  test('accepts a valid signature for a known event, and records the reference', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_accepted' }, type: 'email.received' })
    const { recordedEvents, repository } = buildRepository({ settings: SETTINGS })
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-1',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: sign(body),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'accepted' })
    expect(recordedEvents).toEqual([
      {
        companyId: COMPANY_ID,
        correlationId: 'correlation-1',
        occurredAt: NOW,
        providerEmailId: 'evt_accepted',
      },
    ])
  })

  test('ignores a well-signed event of a type nobody cares about, without recording anything', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_ignored' }, type: 'email.clicked' })
    const { recordedEvents, repository } = buildRepository({ settings: SETTINGS })
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-2',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: sign(body),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'ignored' })
    expect(recordedEvents).toEqual([])
  })

  test('is unauthorized for an unknown webhookId', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_x' }, type: 'email.received' })
    const { repository } = buildRepository({ settings: undefined })
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-3',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: sign(body),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookId: 'this-webhook-does-not-exist',
    })

    expect(result).toEqual({ outcome: 'unauthorized' })
  })

  test('is unauthorized for a bad signature, and never touches the repository write path', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_y' }, type: 'email.received' })
    const { recordedEvents, repository } = buildRepository({ settings: SETTINGS })
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-4',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: 'v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU=',
      svixTimestamp: SVIX_TIMESTAMP,
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'unauthorized' })
    expect(recordedEvents).toEqual([])
  })

  /**
   * plan.md § Segurança e tenant: o envelope não abrir (chave do keyring girada, dado corrompido) é
   * fail-closed, no mesmo pé de configuração ausente — nunca um 500 que revela mais do que "não deu
   * para confiar nesta assinatura".
   */
  test('is unauthorized when the sealed secret cannot be opened', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_z' }, type: 'email.received' })
    const { repository } = buildRepository({ settings: SETTINGS })
    const brokenSecretService: ContractorMailCredentialSecretService = {
      async decrypt() {
        throw new Error('vault unavailable')
      },
      async encrypt() {
        throw new Error('not used by this contract')
      },
    }
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService: brokenSecretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-5',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: sign(body),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'unauthorized' })
  })

  /**
   * Revisão do `architect`: rejeição barata primeiro — presença/formato dos cabeçalhos `svix-*` e a
   * janela de 5 minutos não pedem banco nem segredo. Um timestamp fora da janela é `unauthorized`
   * sem `lookupSettings` alcançar o repositório.
   */
  test('rejects a timestamp outside the five minute window without consulting the repository', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_old' }, type: 'email.received' })
    const oldTimestamp = String(Math.floor(NOW.getTime() / 1000) - 6 * 60)
    const { repository } = buildRepository({ settings: SETTINGS })
    const findSettingsCalls: string[] = []
    const trackedRepository: ContractorMailRepositoryPort = {
      ...repository,
      async findSettingsByWebhookId(input) {
        findSettingsCalls.push(input.webhookId)
        return repository.findSettingsByWebhookId(input)
      },
    }
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository: trackedRepository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-6',
      rawBody: body,
      svixId: SVIX_ID,
      svixSignature: 'v1,ignoredbecausetherejectionhappensbeforethehmaccheck=',
      svixTimestamp: oldTimestamp,
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'unauthorized' })
    expect(findSettingsCalls).toEqual([])
  })

  test('rejects missing svix-* headers without consulting the repository', async () => {
    const body = JSON.stringify({ data: { email_id: 'evt_missing' }, type: 'email.received' })
    const { repository } = buildRepository({ settings: SETTINGS })
    const findSettingsCalls: string[] = []
    const trackedRepository: ContractorMailRepositoryPort = {
      ...repository,
      async findSettingsByWebhookId(input) {
        findSettingsCalls.push(input.webhookId)
        return repository.findSettingsByWebhookId(input)
      },
    }
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository: trackedRepository,
      secretService,
    })

    const result = await useCase.execute({
      correlationId: 'correlation-7',
      rawBody: body,
      svixId: '',
      svixSignature: '',
      svixTimestamp: '',
      webhookId: WEBHOOK_ID,
    })

    expect(result).toEqual({ outcome: 'unauthorized' })
    expect(findSettingsCalls).toEqual([])
  })
})

/**
 * Spec 183 T405 (RF14): o status que o Resend dá depois do envio chega pelo mesmo webhook assinado e
 * vai para a mensagem da conversa da ocorrência, pela política — nunca para o outbox de recebidas.
 */
describe('status do Resend no webhook (spec 183 T405)', () => {
  type AppliedStatus = Parameters<OccurrenceMailStatusPort['apply']>[0]

  function buildUseCase(input: { readonly withStatusPort: boolean }) {
    const applied: AppliedStatus[] = []
    const { recordedEvents, repository } = buildRepository({ settings: SETTINGS })
    const useCase = createProcessInboundEmailWebhookUseCase({
      now: () => NOW,
      repository,
      secretService,
      ...(input.withStatusPort
        ? {
            occurrenceMailStatus: {
              apply: async (status: AppliedStatus) => void applied.push(status),
            },
          }
        : {}),
    })
    const execute = (type: string) => {
      const body = JSON.stringify({ data: { email_id: 'em_status' }, type })
      return useCase.execute({
        correlationId: 'correlation-status',
        rawBody: body,
        svixId: SVIX_ID,
        svixSignature: sign(body),
        svixTimestamp: SVIX_TIMESTAMP,
        webhookId: WEBHOOK_ID,
      })
    }
    return { applied, execute, recordedEvents }
  }

  test('entregue, devolvido, enviado e falho viram o status da mensagem, na empresa do webhook', async () => {
    const { applied, execute, recordedEvents } = buildUseCase({ withStatusPort: true })

    for (const type of ['email.delivered', 'email.bounced', 'email.sent', 'email.failed']) {
      expect(await execute(type)).toEqual({ outcome: 'accepted' })
    }

    expect(applied).toEqual([
      { at: NOW, companyId: COMPANY_ID, incoming: 'delivered', providerEmailId: 'em_status' },
      { at: NOW, companyId: COMPANY_ID, incoming: 'bounced', providerEmailId: 'em_status' },
      { at: NOW, companyId: COMPANY_ID, incoming: 'sent', providerEmailId: 'em_status' },
      { at: NOW, companyId: COMPANY_ID, incoming: 'failed', providerEmailId: 'em_status' },
    ])
    expect(recordedEvents).toEqual([])
  })

  test('aberto, clicado, atrasado e reclamação não são status da conversa (D7: e-mail não tem "lida")', async () => {
    const { applied, execute } = buildUseCase({ withStatusPort: true })

    for (const type of [
      'email.opened',
      'email.clicked',
      'email.delivery_delayed',
      'email.complained',
    ]) {
      expect(await execute(type)).toEqual({ outcome: 'ignored' })
    }
    expect(applied).toEqual([])
  })

  test('sem a porta de status, o evento de status segue ignorado como antes', async () => {
    const { applied, execute } = buildUseCase({ withStatusPort: false })

    expect(await execute('email.delivered')).toEqual({ outcome: 'ignored' })
    expect(applied).toEqual([])
  })
})
