/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  OpenContractorMailTestEmailThreadInput,
} from '../../src/contractor-mail/application/contractor-mail.port'
import {
  buildContractorMailTestEmailBody,
  createSendContractorMailTestEmailUseCase,
} from '../../src/contractor-mail/application/send-contractor-mail-test-email.use-case'
import {
  ContractorMailNotConfiguredError,
  ContractorMailTestRecipientUnavailableError,
} from '../../src/contractor-mail/domain/contractor-mail.error'
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
  status: 'pending',
  version: 1n,
  webhookId: '00000000-0000-4000-8000-0000000000e3',
}

const CONTEXT = { companyId: SETTINGS.companyId, userId: '00000000-0000-4000-8000-0000000000e4' }

function createHarness(input: {
  readonly openError?: Error
  readonly recipientEmail: string | undefined
  readonly settings: ContractorMailSettingsRecord | undefined
}): {
  readonly openCalls: OpenContractorMailTestEmailThreadInput[]
  readonly resolverCalls: readonly { readonly companyId: string; readonly userId: string }[]
  readonly useCase: ReturnType<typeof createSendContractorMailTestEmailUseCase>
} {
  const openCalls: OpenContractorMailTestEmailThreadInput[] = []
  const resolverCalls: { readonly companyId: string; readonly userId: string }[] = []

  const repository = {
    async findSettings() {
      return input.settings
    },
    async openTestEmailThread(openInput: OpenContractorMailTestEmailThreadInput) {
      openCalls.push(openInput)
      if (input.openError !== undefined) throw input.openError
      return { threadId: '00000000-0000-4000-8000-0000000000e5' }
    },
  } as unknown as ContractorMailRepositoryPort

  const actorEmailResolver: ActorEmailResolver = {
    async resolve(resolveInput) {
      resolverCalls.push(resolveInput)
      return input.recipientEmail
    },
  }

  return {
    openCalls,
    resolverCalls,
    useCase: createSendContractorMailTestEmailUseCase({ actorEmailResolver, repository }),
  }
}

describe('send contractor mail test email use case (spec 143, T009, P0/RF13)', () => {
  test('refuses to send when the company has no configuration', async () => {
    const harness = createHarness({ recipientEmail: undefined, settings: undefined })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c1' }),
    ).rejects.toBeInstanceOf(ContractorMailNotConfiguredError)
    expect(harness.openCalls).toHaveLength(0)
  })

  /** RF13/Objetivo item 1: o destinatário vem do contexto autenticado, nunca do corpo. */
  test('resolves the recipient from the authenticated actor, scoped to the company', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: 'admin@example.com' })

    await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c2' })

    expect(harness.resolverCalls).toEqual([
      { companyId: CONTEXT.companyId, userId: CONTEXT.userId },
    ])
    expect(harness.openCalls[0]?.toAddress).toBe('admin@example.com')
  })

  test('refuses to send when the actor has no email on file', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: undefined })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c3' }),
    ).rejects.toBeInstanceOf(ContractorMailTestRecipientUnavailableError)
    expect(harness.openCalls).toHaveLength(0)
  })

  test('opens the thread with the sender address, a hashed token and a reply address on the reply domain', async () => {
    const harness = createHarness({ settings: SETTINGS, recipientEmail: 'admin@example.com' })

    const result = await harness.useCase.execute({ context: CONTEXT, correlationId: 'contract-c4' })

    expect(result).toEqual({ threadId: '00000000-0000-4000-8000-0000000000e5' })
    const call = harness.openCalls[0]
    expect(call).toMatchObject({
      actorUserId: CONTEXT.userId,
      companyId: CONTEXT.companyId,
      correlationId: 'contract-c4',
      fromAddress: SETTINGS.senderAddress,
      toAddress: 'admin@example.com',
    })
    expect(call?.replyTokenHash).toMatch(HEX_SHA256_PATTERN)
    expect(call?.replyToAddress.endsWith(`@${SETTINGS.replyDomain}`)).toBe(true)
    expect(call?.bodyText).toBe(
      buildContractorMailTestEmailBody({ senderName: SETTINGS.senderName }),
    )
  })

  test('never puts a secret in the message body', () => {
    const body = buildContractorMailTestEmailBody({ senderName: SETTINGS.senderName })

    expect(body).toContain(SETTINGS.senderName)
    expect(body.length).toBeGreaterThan(0)
  })
})
