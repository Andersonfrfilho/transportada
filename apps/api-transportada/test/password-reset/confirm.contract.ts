/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createConfirmPasswordResetUseCase } from '../../src/identity/application/confirm-password-reset.use-case.js'
import { hashInvitationCode } from '../../src/identity/domain/invitation.policy.js'
import { PASSWORD_RESET_MAX_ATTEMPTS } from '../../src/identity/domain/password-reset.constant.js'
import { PasswordResetCodeRejectedError } from '../../src/identity/domain/password-reset.error.js'
import type { PasswordResetSnapshot } from '../../src/identity/domain/password-reset.policy.js'
import {
  COMPANY_ALPHA,
  createRepositoryFake,
  RESET_CODE,
  RESET_PASSWORD,
  USER_ID,
} from './support.js'

const NOW = new Date('2026-08-13T12:00:00.000Z')

const REQUEST_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const SUBJECT = 'keycloak-subject-de-contrato'

const buildRequest = (overrides: Partial<PasswordResetSnapshot> = {}): PasswordResetSnapshot => ({
  attemptCount: 0,
  codeHash: hashInvitationCode(RESET_CODE),
  companyId: COMPANY_ALPHA,
  consumedAt: undefined,
  expiresAt: new Date(NOW.getTime() + 60_000),
  id: REQUEST_ID,
  userId: USER_ID,
  ...overrides,
})

const buildUseCase = (request: PasswordResetSnapshot | undefined) => {
  const identityCalls: string[] = []
  const passwords: { readonly temporary: boolean; readonly userId: string }[] = []
  const repository = createRepositoryFake({ request })

  const useCase = createConfirmPasswordResetUseCase({
    identities: {
      async findIdentitySubject() {
        return SUBJECT
      },
    },
    identityProvider: {
      async setPassword({ temporary, userId }) {
        identityCalls.push('setPassword')
        passwords.push({ temporary, userId })
      },
    },
    now: () => NOW,
    requests: repository,
  })

  return { identityCalls, passwords, repository, useCase }
}

describe('confirm password reset', () => {
  test('changes the password and marks consumption', async () => {
    const { passwords, repository, useCase } = buildUseCase(buildRequest())

    await useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD })

    expect(passwords).toEqual([{ temporary: false, userId: SUBJECT }])
    expect(repository.consumed).toEqual([{ companyId: COMPANY_ALPHA, requestId: REQUEST_ID }])
  })

  test('never enables the account', async () => {
    // A dependência não expõe `setEnabled`: reabrir conta desabilitada com um código de e-mail
    // seria escalada de privilégio, e o tipo é o que garante que ninguém acrescente a chamada.
    const { identityCalls, useCase } = buildUseCase(buildRequest())

    await useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD })

    expect(identityCalls).toEqual(['setPassword'])
  })

  test('refuses the same code a second time', async () => {
    const { useCase } = buildUseCase(buildRequest({ consumedAt: new Date(NOW.getTime() - 1_000) }))

    expect(useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD })).rejects.toThrow(
      PasswordResetCodeRejectedError,
    )
  })

  test('refuses expired, wrong, consumed and unknown with the same error', async () => {
    const cases = [
      buildUseCase(undefined),
      buildUseCase(buildRequest({ expiresAt: new Date(NOW.getTime() - 1) })),
      buildUseCase(buildRequest({ consumedAt: NOW })),
      buildUseCase(buildRequest({ codeHash: hashInvitationCode('0000000000000000') })),
    ]

    const codes: string[] = []
    for (const { useCase } of cases) {
      try {
        await useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD })
        throw new Error('should have been refused')
      } catch (error) {
        codes.push((error as { code: string }).code)
      }
    }

    expect(new Set(codes)).toEqual(new Set(['PASSWORD_RESET_CODE_REJECTED']))
  })

  test('refuses the right code once the attempts are spent', async () => {
    const { passwords, useCase } = buildUseCase(
      buildRequest({ attemptCount: PASSWORD_RESET_MAX_ATTEMPTS }),
    )

    expect(useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD })).rejects.toThrow(
      PasswordResetCodeRejectedError,
    )
    expect(passwords).toEqual([])
  })

  test('counts the wrong attempt against the live request', async () => {
    const { repository, useCase } = buildUseCase(
      buildRequest({ codeHash: hashInvitationCode('0000000000000000') }),
    )

    await useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD }).catch(() => undefined)

    expect(repository.failedAttempts).toEqual([REQUEST_ID])
  })

  test('does not touch the password store when the code is refused', async () => {
    const { passwords, useCase } = buildUseCase(undefined)

    await useCase.execute({ code: RESET_CODE, password: RESET_PASSWORD }).catch(() => undefined)

    expect(passwords).toEqual([])
  })
})
