/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  RecordContractorMailTestEmailInput,
  ReserveContractorMailSetupTestThreadInput,
} from '../../src/contractor-mail/application/contractor-mail.port'
import {
  buildContractorMailTestEmailBody,
  createSendContractorMailTestEmailUseCase,
} from '../../src/contractor-mail/application/send-contractor-mail-test-email.use-case'
import {
  ContractorMailNotConfiguredError,
  ContractorMailSendingNotVerifiedError,
  ContractorMailTestRecipientUnavailableError,
} from '../../src/contractor-mail/domain/contractor-mail.error'
import type { ContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service'
import type { ActorEmailResolver } from '../../src/contractor-mail/infrastructure/actor-email.repository'

const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/

const SETTINGS: ContractorMailSettingsRecord = {
  companyId: '00000000-0000-4000-8000-0000000000e1',
  id: '00000000-0000-4000-8000-0000000000e2',
  lastWebhookAt: undefined,
  replyDomain: 'resposta.fernandes-transportadora.com.br',
  secretEnvelope: { algorithm: 'A256GCM', ciphertext: 'x', keyId: 'k', nonce: 'n', version: 1 },
  senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
  senderName: 'Fernandes Transportadora',
  sendingVerifiedAt: new Date('2026-09-15T12:00:00.000Z'),
  status: 'pending',
  version: 1n,
  webhookId: '00000000-0000-4000-8000-0000000000e3',
}

const CONTEXT = { companyId: SETTINGS.companyId, userId: '00000000-0000-4000-8000-0000000000e4' }
const REPLY_TOKEN_SECRET = 'c'.repeat(64)
const EXISTING_THREAD_ID = '00000000-0000-4000-8000-0000000000e6'

function createSecretService(): ContractorMailCredentialSecretService {
  return {
    async decrypt() {
      return {
        apiKey: 're_synthetic',
        replyTokenSecret: REPLY_TOKEN_SECRET,
        webhookSigningSecret: 'whsec_synthetic',
      }
    },
    async encrypt() {
      throw new Error('encrypt should not be called by this use case')
    },
  }
}

function createHarness(input: {
  readonly existingThreadId?: string
  readonly recipientEmail: string | undefined
  readonly settings: ContractorMailSettingsRecord | undefined
}): {
  readonly reserveCalls: ReserveContractorMailSetupTestThreadInput[]
  readonly recordCalls: RecordContractorMailTestEmailInput[]
  readonly resolverCalls: readonly { readonly companyId: string; readonly userId: string }[]
  readonly useCase: ReturnType<typeof createSendContractorMailTestEmailUseCase>
} {
  const reserveCalls: ReserveContractorMailSetupTestThreadInput[] = []
  const recordCalls: RecordContractorMailTestEmailInput[] = []
  const resolverCalls: { readonly companyId: string; readonly userId: string }[] = []

  const repository = {
    async findSettings() {
      return input.settings
    },
    async recordTestEmailMessage(recordInput: RecordContractorMailTestEmailInput) {
      recordCalls.push(recordInput)
      return { threadId: recordInput.threadId }
    },
    async reserveSetupTestThread(reserveInput: ReserveContractorMailSetupTestThreadInput) {
      reserveCalls.push(reserveInput)
      return { threadId: input.existingThreadId ?? reserveInput.candidateThreadId }
    },
  } as unknown as ContractorMailRepositoryPort

  const actorEmailResolver: ActorEmailResolver = {
    async resolve(resolveInput) {
      resolverCalls.push(resolveInput)
      return input.recipientEmail
    },
  }

  return {
    reserveCalls,
    recordCalls,
    resolverCalls,
    useCase: createSendContractorMailTestEmailUseCase({
      actorEmailResolver,
      repository,
      secretService: createSecretService(),
    }),
  }
}

describe('send contractor mail test email use case (spec 143, T009 — correção pós-entrega, P0/RF13/RF7)', () => {
  test('refuses to send when the company has no configuration', async () => {
    const harness = createHarness({ recipientEmail: undefined, settings: undefined })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c1' }),
    ).rejects.toBeInstanceOf(ContractorMailNotConfiguredError)
    expect(harness.reserveCalls).toHaveLength(0)
    expect(harness.recordCalls).toHaveLength(0)
  })

  /**
   * Spec 150 T401: o teste é justamente o que prova a ida e volta — ele sai com `status` ainda
   * `pending`, desde que a chave e o domínio do remetente estejam verificados.
   */
  test('sends while the round-trip status is still pending once the sender is verified', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: 'admin@example.com' })

    await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c0' })

    expect(SETTINGS.status).toBe('pending')
    expect(harness.recordCalls).toHaveLength(1)
  })

  test('refuses with SENDING_NOT_VERIFIED while the sender is not verified', async () => {
    const harness = createHarness({
      recipientEmail: 'admin@example.com',
      settings: { ...SETTINGS, sendingVerifiedAt: undefined },
    })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c01' }),
    ).rejects.toBeInstanceOf(ContractorMailSendingNotVerifiedError)
    expect(harness.reserveCalls).toHaveLength(0)
    expect(harness.recordCalls).toHaveLength(0)
  })

  /** RF13/Objetivo item 1: o destinatário vem do contexto autenticado, nunca do corpo. */
  test('resolves the recipient from the authenticated actor, scoped to the company', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: 'admin@example.com' })

    await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c2' })

    expect(harness.resolverCalls).toEqual([
      { companyId: CONTEXT.companyId, userId: CONTEXT.userId },
    ])
    expect(harness.recordCalls[0]?.toAddresses).toEqual(['admin@example.com'])
  })

  test('refuses to send when the actor has no email on file', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: undefined })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c3' }),
    ).rejects.toBeInstanceOf(ContractorMailTestRecipientUnavailableError)
    expect(harness.reserveCalls).toHaveLength(0)
  })

  test('reserves the setup_test thread with a hashed candidate token before recording the message', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: 'admin@example.com' })

    const result = await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c4' })

    expect(harness.reserveCalls).toHaveLength(1)
    expect(harness.reserveCalls[0]?.companyId).toBe(CONTEXT.companyId)
    expect(harness.reserveCalls[0]?.candidateThreadId).toMatch(/^[0-9a-f-]{36}$/)
    expect(harness.reserveCalls[0]?.candidateReplyTokenHash).toMatch(HEX_SHA256_PATTERN)

    const call = harness.recordCalls[0]
    expect(call).toMatchObject({
      actorUserId: CONTEXT.userId,
      companyId: CONTEXT.companyId,
      correlationId: 'contract-c4',
      fromAddress: SETTINGS.senderAddress,
      threadId: harness.reserveCalls[0]?.candidateThreadId,
      toAddresses: ['admin@example.com'],
    })
    expect(call?.subject.length).toBeGreaterThan(0)
    expect(call?.bodyText).toBe(
      buildContractorMailTestEmailBody({ senderName: SETTINGS.senderName }),
    )
    const candidateThreadId = harness.reserveCalls[0]?.candidateThreadId
    if (candidateThreadId === undefined) throw new Error('reserve was never called')
    expect(result).toEqual({ threadId: candidateThreadId })
  })

  /** RF7 via reserva: se a conversa já existir, a mensagem é gravada no threadId confirmado, não no candidato. */
  test('records the message against the confirmed threadId, even when it differs from the candidate', async () => {
    const harness = createHarness({
      existingThreadId: EXISTING_THREAD_ID,
      recipientEmail: 'admin@example.com',
      settings: SETTINGS,
    })

    const result = await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c5' })

    expect(result).toEqual({ threadId: EXISTING_THREAD_ID })
    expect(harness.recordCalls[0]?.threadId).toBe(EXISTING_THREAD_ID)
    expect(harness.recordCalls[0]?.threadId).not.toBe(harness.reserveCalls[0]?.candidateThreadId)
  })

  test('never puts a secret in the message body', () => {
    const body = buildContractorMailTestEmailBody({ senderName: SETTINGS.senderName })

    expect(body).toContain(SETTINGS.senderName)
    expect(body.length).toBeGreaterThan(0)
  })
})
