/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createSynchronizeIdentitiesUseCase,
  SYNC_SKIP_REASON,
} from '../../src/identity/application/synchronize-identities.use-case.js'

const CONTEXT = {
  companyId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-0000000000aa',
} as const

const ISSUER = 'https://keycloak.test/realms/transportada'

type Call = Record<string, unknown>

function createFakes(
  input: {
    readonly local?: readonly Record<string, unknown>[]
    readonly realm?: readonly Record<string, unknown>[]
  } = {},
) {
  const audits: Call[] = []
  const created: Call[] = []
  const linked: Call[] = []
  const realmUsers: Call[] = []

  return {
    audit: {
      async record(call: Call) {
        audits.push(call)
      },
    },
    audits,
    created,
    gateway: {
      async createUser(call: Call) {
        realmUsers.push(call)
        return { subject: 'subject-novo' }
      },
      async listUsers() {
        return { hasMore: false, users: input.realm ?? [] }
      },
    },
    issuer: ISSUER,
    linked,
    realmUsers,
    repository: {
      async createInvitedUser(call: Call) {
        created.push(call)
        return { linkedFleetDriverId: null, membershipId: 'membership-1' }
      },
      async findIdentitySubject() {
        return undefined
      },
      async linkIdentitySubject(call: Call) {
        linked.push(call)
      },
      async listForReconciliation() {
        return input.local ?? []
      },
    },
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createSynchronizeIdentitiesUseCase(
    fakes as unknown as Parameters<typeof createSynchronizeIdentitiesUseCase>[0],
  )
}

describe('sincronizar — do produto para o realm', () => {
  test('cria a conta que falta e guarda o vínculo', async () => {
    const fakes = createFakes({
      local: [
        {
          contactAddress: 'ana@empresa.test',
          contactChannel: 'email',
          email: '',
          membershipId: 'membership-1',
          name: 'Ana',
          taxId: '',
          userId: 'user-1',
        },
      ],
    })

    const result = await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: [],
      userIds: ['user-1'],
    })

    expect(result.createdInRealm).toEqual(['user-1'])
    expect(fakes.realmUsers[0]).toMatchObject({ email: 'ana@empresa.test', enabled: false })
    expect(fakes.linked[0]).toMatchObject({ subject: 'subject-novo', userId: 'user-1' })
  })

  /**
   * Habilitar sem a pessoa ter escolhido senha abriria acesso que ninguém pediu: o caminho de
   * ativação continua sendo o convite, como na criação normal.
   */
  test('a conta nasce desabilitada', async () => {
    const fakes = createFakes({
      local: [
        {
          contactAddress: 'ana@empresa.test',
          contactChannel: 'email',
          email: '',
          membershipId: 'membership-1',
          name: 'Ana',
          taxId: '',
          userId: 'user-1',
        },
      ],
    })

    await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: [],
      userIds: ['user-1'],
    })

    expect(fakes.realmUsers[0]?.['enabled']).toBe(false)
  })

  test('quem já tem vínculo não é criado de novo', async () => {
    const fakes = createFakes({
      local: [
        {
          contactAddress: 'ana@empresa.test',
          contactChannel: 'email',
          email: '',
          membershipId: 'membership-1',
          name: 'Ana',
          subject: 'subject-existente',
          taxId: '',
          userId: 'user-1',
        },
      ],
    })

    const result = await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: [],
      userIds: ['user-1'],
    })

    expect(result.createdInRealm).toEqual([])
    expect(fakes.realmUsers).toHaveLength(0)
  })
})

describe('sincronizar — do realm para o produto', () => {
  test('traz a conta e ela nasce sem papel nenhum', async () => {
    const fakes = createFakes({
      realm: [
        {
          email: 'nova@empresa.test',
          enabled: true,
          subject: 'sub-1',
          taxId: '',
          username: 'nova',
        },
      ],
    })

    const result = await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: ['sub-1'],
      userIds: [],
    })

    expect(result.createdLocally).toHaveLength(1)
    expect(fakes.created[0]).toMatchObject({ roles: [], subject: 'sub-1' })
  })

  /**
   * Conta de serviço não é gente. O realm hospeda robôs — o do próprio produto e o de qualquer outro
   * cliente do mesmo realm —, e importá-los daria membership de empresa a um processo.
   */
  test('recusa conta de serviço, e diz que recusou', async () => {
    const fakes = createFakes({
      realm: [
        {
          email: '',
          enabled: true,
          subject: 'sub-robo',
          taxId: '',
          username: 'service-account-transportada-admin',
        },
      ],
    })

    const result = await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: ['sub-robo'],
      userIds: [],
    })

    expect(result.createdLocally).toEqual([])
    expect(result.skipped).toEqual([
      { reason: SYNC_SKIP_REASON.SERVICE_ACCOUNT, subject: 'sub-robo' },
    ])
    expect(fakes.created).toHaveLength(0)
  })

  /** Silenciar a ausência faria o operador achar que sincronizou o que não existe mais. */
  test('subject que não existe no realm vira recusa nomeada', async () => {
    const fakes = createFakes({ realm: [] })

    const result = await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: ['sub-fantasma'],
      userIds: [],
    })

    expect(result.skipped).toEqual([
      { reason: SYNC_SKIP_REASON.NOT_FOUND, subject: 'sub-fantasma' },
    ])
  })
})

describe('sincronizar — a trilha', () => {
  test('cada direção grava a própria ação, e nada é gravado à toa', async () => {
    const fakes = createFakes({
      local: [
        {
          contactAddress: 'ana@empresa.test',
          contactChannel: 'email',
          email: '',
          membershipId: 'membership-1',
          name: 'Ana',
          taxId: '',
          userId: 'user-1',
        },
      ],
      realm: [
        {
          email: 'nova@empresa.test',
          enabled: true,
          subject: 'sub-1',
          taxId: '',
          username: 'nova',
        },
      ],
    })

    await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: ['sub-1'],
      userIds: ['user-1'],
    })

    expect(fakes.audits.map((entry) => entry['action'])).toEqual([
      'company-user.realm-account.created',
      'company-user.imported-from-realm',
    ])
  })

  test('sincronização que não criou ninguém não grava linha', async () => {
    const fakes = createFakes({ realm: [] })

    await createUseCase(fakes).execute({
      context: CONTEXT,
      correlationId: 'correlation-1',
      subjects: ['sub-fantasma'],
      userIds: [],
    })

    expect(fakes.audits).toHaveLength(0)
  })
})
