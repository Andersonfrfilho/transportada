/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_TTL_MINUTES,
} from '../../src/identity/domain/password-reset.constant.js'
import {
  decidePasswordReset,
  planPasswordReset,
  shouldRegisterFailedResetAttempt,
  type PasswordResetSnapshot,
} from '../../src/identity/domain/password-reset.policy.js'
import { hashInvitationCode } from '../../src/identity/domain/invitation.policy.js'

const NOW = new Date('2026-08-13T12:00:00.000Z')

const CODE = 'a1b2c3d4e5f60718'

const buildRequest = (overrides: Partial<PasswordResetSnapshot> = {}): PasswordResetSnapshot => ({
  attemptCount: 0,
  codeHash: hashInvitationCode(CODE),
  companyId: '3f1d0b6e-2f6f-4a1e-9a4a-0a1a2b3c4d5e',
  consumedAt: undefined,
  expiresAt: new Date(NOW.getTime() + 60_000),
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  userId: 'b4f0c6a2-8d33-4a76-9d7b-1f2e3a4b5c6d',
  ...overrides,
})

describe('password reset policy', () => {
  test('expires in fifteen minutes and allows five attempts', () => {
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(15)
    expect(PASSWORD_RESET_MAX_ATTEMPTS).toBe(5)
  })

  test('plans the window from the request instant', () => {
    expect(planPasswordReset({ now: NOW }).expiresAt).toEqual(
      new Date(NOW.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    )
  })

  test('accepts the right code and marks consumption at the attempt instant', () => {
    const decision = decidePasswordReset({
      attemptedCodeHash: hashInvitationCode(CODE),
      now: NOW,
      request: buildRequest(),
    })

    expect(decision).toEqual({
      companyId: '3f1d0b6e-2f6f-4a1e-9a4a-0a1a2b3c4d5e',
      consumedAt: NOW,
      outcome: 'accepted',
      requestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      userId: 'b4f0c6a2-8d33-4a76-9d7b-1f2e3a4b5c6d',
    })
  })

  test('carries no instruction to enable the account', () => {
    // Recuperar senha é de quem já entrava. Se a conta está desabilitada, ela continua desabilitada:
    // reabrir acesso revogado por um código de e-mail seria escalada de privilégio.
    const decision = decidePasswordReset({
      attemptedCodeHash: hashInvitationCode(CODE),
      now: NOW,
      request: buildRequest(),
    })

    expect(Object.keys(decision).sort()).not.toContain('enableAccount')
    expect(Object.keys(decision).sort()).not.toContain('setEnabled')
  })

  test('refuses without a distinguishable reason', () => {
    const rejected = { outcome: 'rejected' } as const
    const attemptedCodeHash = hashInvitationCode(CODE)

    const notFound = decidePasswordReset({ attemptedCodeHash, now: NOW, request: undefined })
    const consumed = decidePasswordReset({
      attemptedCodeHash,
      now: NOW,
      request: buildRequest({ consumedAt: new Date(NOW.getTime() - 1_000) }),
    })
    const expired = decidePasswordReset({
      attemptedCodeHash,
      now: NOW,
      request: buildRequest({ expiresAt: new Date(NOW.getTime() - 1) }),
    })
    const exhausted = decidePasswordReset({
      attemptedCodeHash,
      now: NOW,
      request: buildRequest({ attemptCount: PASSWORD_RESET_MAX_ATTEMPTS }),
    })
    const wrongCode = decidePasswordReset({
      attemptedCodeHash: hashInvitationCode('0000000000000000'),
      now: NOW,
      request: buildRequest(),
    })

    expect([notFound, consumed, expired, exhausted, wrongCode]).toEqual([
      rejected,
      rejected,
      rejected,
      rejected,
      rejected,
    ])
  })

  test('refuses the right code once the attempts are spent', () => {
    expect(
      decidePasswordReset({
        attemptedCodeHash: hashInvitationCode(CODE),
        now: NOW,
        request: buildRequest({ attemptCount: PASSWORD_RESET_MAX_ATTEMPTS }),
      }),
    ).toEqual({ outcome: 'rejected' })
  })

  test('expires exactly at the boundary', () => {
    expect(
      decidePasswordReset({
        attemptedCodeHash: hashInvitationCode(CODE),
        now: NOW,
        request: buildRequest({ expiresAt: NOW }),
      }),
    ).toEqual({ outcome: 'rejected' })
  })

  test('counts an attempt only against a live request with a wrong code', () => {
    const wrongHash = hashInvitationCode('0000000000000000')

    expect(
      shouldRegisterFailedResetAttempt({
        attemptedCodeHash: wrongHash,
        now: NOW,
        request: buildRequest(),
      }),
    ).toBe(true)
    expect(
      shouldRegisterFailedResetAttempt({
        attemptedCodeHash: hashInvitationCode(CODE),
        now: NOW,
        request: buildRequest(),
      }),
    ).toBe(false)
  })

  test('does not count attempts against what has no live counter', () => {
    const attemptedCodeHash = hashInvitationCode('0000000000000000')

    // Contar contra pedido inexistente, expirado, consumido ou esgotado não protege nada — e
    // gravar a tentativa contra o que não existe é escrita que não tem onde cair.
    expect([
      shouldRegisterFailedResetAttempt({ attemptedCodeHash, now: NOW, request: undefined }),
      shouldRegisterFailedResetAttempt({
        attemptedCodeHash,
        now: NOW,
        request: buildRequest({ expiresAt: new Date(NOW.getTime() - 1) }),
      }),
      shouldRegisterFailedResetAttempt({
        attemptedCodeHash,
        now: NOW,
        request: buildRequest({ consumedAt: NOW }),
      }),
      shouldRegisterFailedResetAttempt({
        attemptedCodeHash,
        now: NOW,
        request: buildRequest({ attemptCount: PASSWORD_RESET_MAX_ATTEMPTS }),
      }),
    ]).toEqual([false, false, false, false])
  })
})
