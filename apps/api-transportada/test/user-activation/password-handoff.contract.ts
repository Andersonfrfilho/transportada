/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { InvitationCodeRejectedError } from '../../src/identity/domain/invitation.error'
import { INVITATION_MAX_ATTEMPTS } from '../../src/identity/domain/invitation.constant'
import { ACTIVATION_CODE, ACTIVATION_PASSWORD } from '../fixtures/user-activation-http.fixture'

/** Carregado por teste: enquanto o caso de uso não existe, cada regra falha na própria linha. */
const loadUseCase = async () =>
  (await import('../../src/identity/application/activate-invitation.use-case.js')) as {
    createActivateInvitationUseCase(dependencies: Dependencies): {
      execute(input: { readonly code: string; readonly password: string }): Promise<void>
    }
  }

type Call = { readonly name: string; readonly payload: Record<string, unknown> }

type Dependencies = Record<string, unknown>

const COMPANY_ID = '00000000-0000-4000-8000-0000000009b1'
const INVITATION_ID = '00000000-0000-4000-8000-0000000009b2'
const USER_ID = '00000000-0000-4000-8000-0000000009b3'
const SUBJECT = 'c0ffee00-0000-4000-8000-0000000009b3'
const NOW = new Date('2026-08-04T12:00:00.000Z')

const CODE_HASH = new Bun.CryptoHasher('sha256').update(ACTIVATION_CODE).digest('hex').toLowerCase()

type InvitationOverrides = {
  readonly attemptCount?: number
  readonly expiresAt?: Date
  readonly status?: string
}

const pendingInvitation = (overrides: InvitationOverrides = {}) => ({
  acceptedAt: undefined,
  attemptCount: 0,
  codeHash: CODE_HASH,
  companyId: COMPANY_ID,
  expiresAt: new Date('2026-08-05T12:00:00.000Z'),
  id: INVITATION_ID,
  roles: ['fiscal'],
  status: 'pending',
  userId: USER_ID,
  ...overrides,
})

type DoubleParams = {
  readonly invitation?: ReturnType<typeof pendingInvitation> | undefined
  readonly setPasswordError?: Error
}

function createDoubles(params: DoubleParams) {
  const calls: Call[] = []
  const record = (name: string, payload: unknown): void => {
    calls.push({ name, payload: structuredClone(payload) as Record<string, unknown> })
  }

  return {
    calls,
    dependencies: {
      /** Fora do registro de chamadas de propósito: traduzir o id em `subject` não é efeito. */
      identities: { findIdentitySubject: async () => SUBJECT },
      identityProvider: {
        async setEnabled(input: unknown) {
          record('setEnabled', input)
        },
        async setPassword(input: unknown) {
          record('setPassword', input)
          if (params.setPasswordError) throw params.setPasswordError
        },
      },
      invitations: {
        async findByCodeHash(input: unknown) {
          record('findByCodeHash', input)
          return params.invitation
        },
        async markAccepted(input: unknown) {
          record('markAccepted', input)
        },
        async registerFailedAttempt(input: unknown) {
          record('registerFailedAttempt', input)
        },
      },
      now: () => NOW,
    } satisfies Dependencies,
  }
}

const names = (calls: readonly Call[]): readonly string[] => calls.map((call) => call.name)

const activate = async (params: DoubleParams) => {
  const { calls, dependencies } = createDoubles(params)
  const { createActivateInvitationUseCase } = await loadUseCase()
  const useCase = createActivateInvitationUseCase(dependencies)
  return {
    calls,
    run: () => useCase.execute({ code: ACTIVATION_CODE, password: ACTIVATION_PASSWORD }),
  }
}

describe('ativação — a senha não passa pelo domínio nem pelo banco', () => {
  test('chega ao convite só pelo hash do código, nunca pelo código em claro', async () => {
    const { calls, run } = await activate({ invitation: pendingInvitation() })

    await run()

    expect(calls[0]).toEqual({ name: 'findByCodeHash', payload: { codeHash: CODE_HASH } })
    expect(JSON.stringify(calls)).not.toContain(ACTIVATION_CODE)
  })

  test('a senha só aparece na chamada ao provedor de identidade', async () => {
    const { calls, run } = await activate({ invitation: pendingInvitation() })

    await run()

    const carrying = calls.filter((call) =>
      JSON.stringify(call.payload).includes(ACTIVATION_PASSWORD),
    )
    expect(carrying.map((call) => call.name)).toEqual(['setPassword'])
  })

  test('o que é gravado no convite não tem senha, código nem hash', async () => {
    const { calls, run } = await activate({ invitation: pendingInvitation() })

    await run()

    const accepted = calls.find((call) => call.name === 'markAccepted')
    expect(Object.keys(accepted?.payload ?? {}).sort()).toEqual([
      'acceptedAt',
      'companyId',
      'invitationId',
    ])
    expect(JSON.stringify(accepted)).not.toContain(ACTIVATION_PASSWORD)
    expect(JSON.stringify(accepted)).not.toContain(CODE_HASH)
  })
})

describe('ativação — ordem dos efeitos', () => {
  test('define a senha, habilita o usuário e só então conclui o convite', async () => {
    const { calls, run } = await activate({ invitation: pendingInvitation() })

    await run()

    expect(names(calls)).toEqual(['findByCodeHash', 'setPassword', 'setEnabled', 'markAccepted'])
    /** O provedor é endereçado pelo `subject`: o `identity_users.id` não existe do lado de lá. */
    expect(calls[1]?.payload).toMatchObject({ userId: SUBJECT })
    expect(calls[2]?.payload).toEqual({ enabled: true, userId: SUBJECT })
    expect(calls[3]?.payload).toEqual({
      acceptedAt: NOW,
      companyId: COMPANY_ID,
      invitationId: INVITATION_ID,
    })
  })

  test('falha no provedor deixa o convite utilizável, sem habilitar ninguém', async () => {
    const { calls, run } = await activate({
      invitation: pendingInvitation(),
      setPasswordError: new Error('identity provider is unavailable'),
    })

    await expect(run()).rejects.toThrow()
    expect(names(calls)).toEqual(['findByCodeHash', 'setPassword'])
  })
})

describe('ativação — recusas e limite de tentativas', () => {
  test('código errado conta a tentativa e recusa sem tocar no provedor', async () => {
    const { calls, run } = await activate({
      invitation: { ...pendingInvitation(), codeHash: 'a'.repeat(64) },
    })

    await expect(run()).rejects.toThrow(InvitationCodeRejectedError)
    expect(names(calls)).toEqual(['findByCodeHash', 'registerFailedAttempt'])
    expect(calls[1]?.payload).toEqual({ invitationId: INVITATION_ID })
  })

  test('convite inexistente recusa igual, e não há contador para incrementar', async () => {
    const { calls, run } = await activate({ invitation: undefined })

    await expect(run()).rejects.toThrow(InvitationCodeRejectedError)
    expect(names(calls)).toEqual(['findByCodeHash'])
  })

  test('esgotado o limite, nem o código certo habilita o usuário', async () => {
    const { calls, run } = await activate({
      invitation: pendingInvitation({ attemptCount: INVITATION_MAX_ATTEMPTS }),
    })

    await expect(run()).rejects.toThrow(InvitationCodeRejectedError)
    expect(names(calls)).not.toContain('setPassword')
    expect(names(calls)).not.toContain('setEnabled')
  })

  test('convite expirado e convite já aceito recusam sem habilitar ninguém', async () => {
    for (const invitation of [
      pendingInvitation({ expiresAt: new Date('2026-08-04T11:59:59.999Z') }),
      pendingInvitation({ status: 'accepted' }),
    ]) {
      const { calls, run } = await activate({ invitation })

      await expect(run()).rejects.toThrow(InvitationCodeRejectedError)
      expect(names(calls)).not.toContain('setPassword')
      expect(names(calls)).not.toContain('markAccepted')
    }
  })
})
