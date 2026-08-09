/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import type { InvitationSnapshot } from '../../src/identity/domain/invitation.policy.js'

/**
 * Carregado por teste, e não no topo: enquanto o domínio não existe, cada regra falha na
 * própria linha em vez de o arquivo inteiro morrer num único erro de import.
 */
const loadInvitationDomain = async () => ({
  ...(await import('../../src/identity/domain/invitation.constant.js')),
  ...(await import('../../src/identity/domain/invitation.error.js')),
  ...(await import('../../src/identity/domain/invitation.policy.js')),
})

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const INVITATION_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-08-04T12:00:00.000Z')

const hashOf = (seed: string): string =>
  new Bun.CryptoHasher('sha256').update(seed).digest('hex').toLowerCase()

const CORRECT_HASH = hashOf('correct-code')
const WRONG_HASH = hashOf('typed-by-mistake')

const pendingInvitation = (overrides: Partial<InvitationSnapshot> = {}): InvitationSnapshot => ({
  acceptedAt: undefined,
  attemptCount: 0,
  codeHash: CORRECT_HASH,
  companyId: COMPANY_ID,
  expiresAt: new Date('2026-08-05T12:00:00.000Z'),
  id: INVITATION_ID,
  status: 'pending',
  userId: USER_ID,
  ...overrides,
})

describe('regra 1 — o código de ativação é de uso único', () => {
  test('aceita o código correto uma vez, no instante em que ele foi apresentado', async () => {
    const { assertInvitationAccepted, decideInvitationActivation } = await loadInvitationDomain()

    const decision = decideInvitationActivation({
      attemptedCodeHash: CORRECT_HASH,
      invitation: pendingInvitation(),
      now: NOW,
    })

    expect(decision).toEqual({
      acceptedAt: NOW,
      companyId: COMPANY_ID,
      invitationId: INVITATION_ID,
      outcome: 'accepted',
      userId: USER_ID,
    })
    expect(Object.is(assertInvitationAccepted(decision), decision)).toBeTrue()
  })

  test('recusa o mesmo código depois que o convite já foi atendido', async () => {
    const { assertInvitationAccepted, decideInvitationActivation, InvitationCodeRejectedError } =
      await loadInvitationDomain()

    const decision = decideInvitationActivation({
      attemptedCodeHash: CORRECT_HASH,
      invitation: pendingInvitation({ acceptedAt: NOW, status: 'accepted' }),
      now: NOW,
    })

    expect(decision).toEqual({ outcome: 'rejected' })
    expect(() => assertInvitationAccepted(decision)).toThrow(InvitationCodeRejectedError)
  })
})

describe('regra 2 — expirado, já usado e inexistente produzem a mesma recusa', () => {
  test('responde de forma idêntica a expirado, usado, substituído, revogado, desconhecido e errado', async () => {
    const { decideInvitationActivation } = await loadInvitationDomain()

    const decisions = [
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: pendingInvitation({ expiresAt: new Date('2026-08-04T11:59:59.999Z') }),
        now: NOW,
      }),
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: pendingInvitation({ acceptedAt: NOW, status: 'accepted' }),
        now: NOW,
      }),
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: pendingInvitation({ status: 'superseded' }),
        now: NOW,
      }),
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: pendingInvitation({ status: 'revoked' }),
        now: NOW,
      }),
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: undefined,
        now: NOW,
      }),
      decideInvitationActivation({
        attemptedCodeHash: WRONG_HASH,
        invitation: pendingInvitation(),
        now: NOW,
      }),
    ]

    for (const decision of decisions) expect(decision).toEqual({ outcome: 'rejected' })
    expect(new Set(decisions.map((decision) => JSON.stringify(decision))).size).toBe(1)
  })

  test('não leva código, hash nem identificador no que chega a quem chamou', async () => {
    const { InvitationCodeRejectedError } = await loadInvitationDomain()
    const error = new InvitationCodeRejectedError()

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('INVITATION_CODE_REJECTED')
    expect(error.status).toBe(400)
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain(CORRECT_HASH)
    expect(`${error.message}${JSON.stringify(error)}`).not.toContain(USER_ID)
  })
})

describe('regra 3 — o reenvio invalida o código anterior', () => {
  test('substitui o convite pendente e conta a validade a partir do reenvio', async () => {
    const { INVITATION_TTL_MINUTES, planInvitationResend } = await loadInvitationDomain()

    expect(planInvitationResend({ invitation: pendingInvitation(), now: NOW })).toEqual({
      expiresAt: new Date(NOW.getTime() + INVITATION_TTL_MINUTES * 60_000),
      supersededInvitationId: INVITATION_ID,
    })
  })

  test('não tem o que substituir no primeiro convite nem depois de um reenvio anterior', async () => {
    const { INVITATION_TTL_MINUTES, planInvitationResend } = await loadInvitationDomain()

    for (const invitation of [
      undefined,
      pendingInvitation({ status: 'superseded' }),
      pendingInvitation({ status: 'revoked' }),
    ]) {
      expect(planInvitationResend({ invitation, now: NOW })).toEqual({
        expiresAt: new Date(NOW.getTime() + INVITATION_TTL_MINUTES * 60_000),
        supersededInvitationId: undefined,
      })
    }
  })

  test('recusa reenviar código a quem já ativou o acesso', async () => {
    const { InvitationAlreadyAcceptedError, planInvitationResend } = await loadInvitationDomain()

    expect(() =>
      planInvitationResend({
        invitation: pendingInvitation({ acceptedAt: NOW, status: 'accepted' }),
        now: NOW,
      }),
    ).toThrow(InvitationAlreadyAcceptedError)
    expect(new InvitationAlreadyAcceptedError().code).toBe('INVITATION_ALREADY_ACCEPTED')
    expect(new InvitationAlreadyAcceptedError().status).toBe(409)
  })
})

describe('regra 4 — as tentativas são limitadas por pessoa', () => {
  test('ainda aceita o código correto enquanto sobra tentativa', async () => {
    const { INVITATION_MAX_ATTEMPTS, decideInvitationActivation } = await loadInvitationDomain()

    expect(
      decideInvitationActivation({
        attemptedCodeHash: CORRECT_HASH,
        invitation: pendingInvitation({ attemptCount: INVITATION_MAX_ATTEMPTS - 1 }),
        now: NOW,
      }),
    ).toMatchObject({ outcome: 'accepted' })
  })

  test('recusa até o código correto depois que as tentativas acabaram', async () => {
    const { INVITATION_MAX_ATTEMPTS, decideInvitationActivation } = await loadInvitationDomain()

    for (const attemptCount of [INVITATION_MAX_ATTEMPTS, INVITATION_MAX_ATTEMPTS + 1]) {
      expect(
        decideInvitationActivation({
          attemptedCodeHash: CORRECT_HASH,
          invitation: pendingInvitation({ attemptCount }),
          now: NOW,
        }),
      ).toEqual({ outcome: 'rejected' })
    }
  })

  test('mantém o limite baixo o bastante para ser um limite', async () => {
    const { INVITATION_MAX_ATTEMPTS } = await loadInvitationDomain()

    expect(INVITATION_MAX_ATTEMPTS).toBeGreaterThan(0)
    expect(INVITATION_MAX_ATTEMPTS).toBeLessThanOrEqual(10)
  })
})

describe('regra 5 — a empresa nunca fica sem company-admin', () => {
  test('recusa tirar o último company-admin, com erro de domínio próprio', async () => {
    const { assertCompanyKeepsAdministrator, LastCompanyAdminError } = await loadInvitationDomain()

    expect(() =>
      assertCompanyKeepsAdministrator({
        administratorUserIds: [USER_ID],
        nextRoles: ['finance'],
        targetUserId: USER_ID,
      }),
    ).toThrow(LastCompanyAdminError)

    const error = new LastCompanyAdminError()
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('LAST_COMPANY_ADMIN')
    expect(error.status).toBe(409)
  })

  test('recusa também a remoção do vínculo do último company-admin', async () => {
    const { assertCompanyKeepsAdministrator, LastCompanyAdminError } = await loadInvitationDomain()

    expect(() =>
      assertCompanyKeepsAdministrator({
        administratorUserIds: [USER_ID],
        nextRoles: [],
        targetUserId: USER_ID,
      }),
    ).toThrow(LastCompanyAdminError)
  })

  test('deixa um administrador sair enquanto outro permanece', async () => {
    const { assertCompanyKeepsAdministrator } = await loadInvitationDomain()

    expect(() =>
      assertCompanyKeepsAdministrator({
        administratorUserIds: [USER_ID, OTHER_ADMIN_ID],
        nextRoles: [],
        targetUserId: USER_ID,
      }),
    ).not.toThrow()
  })

  test('deixa o último administrador manter o papel enquanto troca os demais', async () => {
    const { assertCompanyKeepsAdministrator } = await loadInvitationDomain()

    expect(() =>
      assertCompanyKeepsAdministrator({
        administratorUserIds: [USER_ID],
        nextRoles: ['company-admin', 'fiscal'],
        targetUserId: USER_ID,
      }),
    ).not.toThrow()
  })

  test('não atrapalha quem nunca foi administrador', async () => {
    const { assertCompanyKeepsAdministrator } = await loadInvitationDomain()

    expect(() =>
      assertCompanyKeepsAdministrator({
        administratorUserIds: [OTHER_ADMIN_ID],
        nextRoles: [],
        targetUserId: USER_ID,
      }),
    ).not.toThrow()
  })
})
