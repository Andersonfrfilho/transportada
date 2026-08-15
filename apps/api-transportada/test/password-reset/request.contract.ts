/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestPasswordResetUseCase } from '../../src/identity/application/request-password-reset.use-case.js'
import { PASSWORD_RESET_TTL_MINUTES } from '../../src/identity/domain/password-reset.constant.js'
import {
  COMPANY_ALPHA,
  COMPANY_BETA,
  createOutboxFake,
  createRepositoryFake,
  envelopeProviderStub,
  RESET_USERNAME,
  USER_ID,
} from './support.js'

const NOW = new Date('2026-08-13T12:00:00.000Z')

const buildUseCase = (targets: readonly { companyId: string; userId: string }[]) => {
  const outbox = createOutboxFake()
  const repository = createRepositoryFake({ targets })
  const useCase = createRequestPasswordResetUseCase({
    envelopeProvider: envelopeProviderStub,
    now: () => NOW,
    outbox,
    requests: repository,
  })

  return { outbox, repository, useCase }
}

describe('request password reset', () => {
  test('does nothing when no active membership answers for the login', async () => {
    const { outbox, repository, useCase } = buildUseCase([])

    await useCase.execute({ username: RESET_USERNAME })

    expect(repository.created).toEqual([])
    expect(outbox.calls).toEqual([])
  })

  test('opens one request and one delivery per active membership', async () => {
    // A empresa sai do servidor: quem tem vínculo em duas recebe dois códigos, e não uma pergunta
    // de qual empresa — a pergunta já contaria que os dois vínculos existem.
    const { outbox, repository, useCase } = buildUseCase([
      { companyId: COMPANY_ALPHA, userId: USER_ID },
      { companyId: COMPANY_BETA, userId: USER_ID },
    ])

    await useCase.execute({ username: RESET_USERNAME })

    expect(repository.created.map((created) => created.companyId)).toEqual([
      COMPANY_ALPHA,
      COMPANY_BETA,
    ])
    expect(outbox.calls.map((call) => call.companyId)).toEqual([COMPANY_ALPHA, COMPANY_BETA])
  })

  test('seals the code and stores only the hash beside it', async () => {
    const { repository, useCase } = buildUseCase([{ companyId: COMPANY_ALPHA, userId: USER_ID }])

    await useCase.execute({ username: RESET_USERNAME })

    const [created] = repository.created
    expect(created?.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(created?.sealedCode).toBeDefined()
    expect(JSON.stringify(created)).not.toContain(RESET_USERNAME)
  })

  test('closes the window fifteen minutes after the request', async () => {
    const { repository, useCase } = buildUseCase([{ companyId: COMPANY_ALPHA, userId: USER_ID }])

    await useCase.execute({ username: RESET_USERNAME })

    expect(repository.created[0]?.expiresAt).toEqual(
      new Date(NOW.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    )
  })

  test('carries a reference payload, never the code or the login', async () => {
    const { outbox, repository, useCase } = buildUseCase([
      { companyId: COMPANY_ALPHA, userId: USER_ID },
    ])

    await useCase.execute({ username: RESET_USERNAME })

    const [call] = outbox.calls
    expect(call?.eventType).toBe('transportada.identity.password-reset.code.requested')
    expect(call?.payload).toEqual({ requestId: repository.created[0]!.id, userId: USER_ID })
    expect(JSON.stringify(call)).not.toContain(RESET_USERNAME)
  })

  test('binds the outbox row to the request it was born with', async () => {
    const { outbox, repository, useCase } = buildUseCase([
      { companyId: COMPANY_ALPHA, userId: USER_ID },
    ])

    await useCase.execute({ username: RESET_USERNAME })

    expect(outbox.calls[0]?.requestId).toBe(repository.created[0]!.id)
  })
})
