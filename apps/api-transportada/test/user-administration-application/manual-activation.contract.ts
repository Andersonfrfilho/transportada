/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createActivateCompanyUserUseCase } from '../../src/identity/application/activate-company-user.use-case.js'
import type { CompanyUserRecord } from '../../src/identity/application/company-user.port.js'
import { CompanyUserNotFoundError } from '../../src/identity/domain/company-user.error.js'
import type { InvitationRecord } from '../../src/identity/application/invitation.port.js'

const COMPANY_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e10'
const ACTOR_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e11'
const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e12'
const SUBJECT = 'subject-no-provedor'
const NOW = new Date('2026-09-16T12:00:00.000Z')

function buildSnapshot(overrides: Partial<CompanyUserRecord> = {}): CompanyUserRecord {
  return {
    contactAddress: 'contato',
    contactChannel: 'email',
    email: 'contato',
    hasPicture: false,
    membershipId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e13',
    membershipStatus: 'active',
    name: 'Pessoa Convidada',
    pendingInvitation: { expiresAt: NOW },
    phone: '',
    roles: ['operator'],
    taxId: '',
    userId: USER_ID,
    username: USER_ID,
    ...overrides,
  }
}

function buildInvitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    acceptedAt: undefined,
    attemptCount: 0,
    codeHash: 'hash',
    companyId: COMPANY_ID,
    expiresAt: NOW,
    id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e14',
    roles: ['operator'],
    status: 'pending',
    userId: USER_ID,
    ...overrides,
  }
}

function createHarness(
  params: {
    readonly invitation?: InvitationRecord | undefined
    readonly snapshot?: CompanyUserRecord | undefined
  } = {},
) {
  const steps: string[] = []
  const audits: Record<string, unknown>[] = []
  const passwords: Record<string, unknown>[] = []
  const accepted: Record<string, unknown>[] = []
  const snapshot = 'snapshot' in params ? params.snapshot : buildSnapshot()
  const invitation = 'invitation' in params ? params.invitation : buildInvitation()

  const useCase = createActivateCompanyUserUseCase({
    audit: {
      async record(input) {
        steps.push('audit')
        audits.push({ ...input })
      },
    },
    identityGateway: {
      async setEnabled({ enabled, userId }) {
        steps.push(`enable:${enabled}:${userId}`)
      },
      async setPassword(input) {
        steps.push('password')
        passwords.push({ ...input })
      },
    },
    invitations: {
      findLatestForUser: async () => invitation,
      async markAccepted(input) {
        steps.push('accept')
        accepted.push({ ...input })
      },
    },
    now: () => NOW,
    repository: {
      findByUserId: async () => snapshot,
      findIdentitySubject: async () => SUBJECT,
      async setMembershipStatus({ status }) {
        steps.push(`membership:${status}`)
      },
    },
  })

  return { accepted, audits, passwords, steps, useCase }
}

const CONTEXT = { companyId: COMPANY_ID, userId: ACTOR_ID }

/**
 * O convite nasce desabilitado no provedor e só a ativação por código habilita. Quando o código não
 * chega, a pessoa fica presa para sempre: quem administra precisa destravar sem depender do canal.
 */
describe('ativação manual do usuário pelo administrador', () => {
  test('habilita no provedor, fecha o convite pendente e registra a trilha', async () => {
    const harness = createHarness()

    const view = await harness.useCase.execute({
      context: CONTEXT,
      correlationId: 'correlacao',
      userId: USER_ID,
    })

    expect(harness.steps).toEqual([`enable:true:${SUBJECT}`, 'accept', 'audit'])
    expect(harness.accepted[0]).toMatchObject({ acceptedAt: NOW, companyId: COMPANY_ID })
    expect(harness.audits[0]).toMatchObject({
      action: 'company-user.activated',
      actorUserId: ACTOR_ID,
      metadata: { passwordSet: false },
      targetIds: [USER_ID],
    })
    expect(view.invitation).toBeUndefined()
    expect(view.status).toBe('active')
  })

  /** Habilitar sem senha deixa a conta aberta e sem como entrar: a senha vai antes de habilitar. */
  test('com senha, grava a senha antes de habilitar e leva o `temporary`', async () => {
    const harness = createHarness()

    await harness.useCase.execute({
      context: CONTEXT,
      correlationId: 'correlacao',
      password: 'senha-de-teste-suficientemente-longa',
      temporary: true,
      userId: USER_ID,
    })

    expect(harness.steps.slice(0, 2)).toEqual(['password', `enable:true:${SUBJECT}`])
    expect(harness.passwords[0]).toMatchObject({ temporary: true, userId: SUBJECT })
    expect(harness.audits[0]).toMatchObject({ metadata: { passwordSet: true, temporary: true } })
    expect(JSON.stringify(harness.audits)).not.toContain('senha-de-teste')
  })

  test('vínculo suspenso volta a ativo no banco antes de o provedor habilitar', async () => {
    const harness = createHarness({ snapshot: buildSnapshot({ membershipStatus: 'disabled' }) })

    const view = await harness.useCase.execute({
      context: CONTEXT,
      correlationId: 'correlacao',
      userId: USER_ID,
    })

    expect(harness.steps.slice(0, 2)).toEqual(['membership:active', `enable:true:${SUBJECT}`])
    expect(view.status).toBe('active')
  })

  test('convite já aceito ou inexistente não é reescrito: repetir converge', async () => {
    for (const invitation of [buildInvitation({ status: 'accepted' }), undefined]) {
      const harness = createHarness({ invitation })

      await harness.useCase.execute({ context: CONTEXT, correlationId: 'c', userId: USER_ID })

      expect(harness.accepted).toHaveLength(0)
      expect(harness.steps).toContain(`enable:true:${SUBJECT}`)
    }
  })

  /** Sem esta guarda, quem administra uma empresa habilitaria qualquer conta do realm pelo id. */
  test('pessoa de outra empresa não chega ao provedor', async () => {
    const harness = createHarness({ snapshot: undefined })

    await expect(
      harness.useCase.execute({ context: CONTEXT, correlationId: 'c', userId: USER_ID }),
    ).rejects.toBeInstanceOf(CompanyUserNotFoundError)
    expect(harness.steps).toHaveLength(0)
  })
})
