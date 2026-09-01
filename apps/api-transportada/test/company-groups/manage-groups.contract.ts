/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createManageCompanyGroupsUseCase } from '../../src/identity/application/manage-company-groups.use-case.js'
import { createManageDirectPermissionsUseCase } from '../../src/identity/application/manage-direct-permissions.use-case.js'

const CONTEXT = {
  companyId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-0000000000aa',
} as const

const GROUP: {
  description: string
  id: string
  keycloakGroupId: string | null
  memberCount: number
  name: string
  permissions: readonly string[]
  roles: readonly string[]
} = {
  description: '',
  id: 'group-1',
  keycloakGroupId: null,
  memberCount: 0,
  name: 'Financeiro',
  permissions: ['billing.read'],
  roles: [],
}

type Call = Record<string, unknown>

function createFakes(
  input: {
    readonly realmFails?: boolean
    readonly saved?: typeof GROUP
    readonly assigned?: readonly {
      groupId: string
      keycloakGroupId: string | null
      subject: string | null
      userId: string
    }[]
  } = {},
) {
  const audits: Call[] = []
  const realmCalls: Call[] = []
  const savedKeycloakIds: Call[] = []

  return {
    audit: {
      async record(call: Call) {
        audits.push(call)
      },
    },
    audits,
    realm: {
      async addMember(call: Call) {
        realmCalls.push({ ...call, operation: 'addMember' })
      },
      async createGroup(call: Call) {
        realmCalls.push({ ...call, operation: 'createGroup' })
        if (input.realmFails === true) throw new Error('keycloak fora do ar')
        return { groupId: 'realm-group-1' }
      },
      async deleteGroup(call: Call) {
        realmCalls.push({ ...call, operation: 'deleteGroup' })
      },
      async removeMember(call: Call) {
        realmCalls.push({ ...call, operation: 'removeMember' })
      },
      async renameGroup(call: Call) {
        realmCalls.push({ ...call, operation: 'renameGroup' })
        if (input.realmFails === true) throw new Error('keycloak fora do ar')
      },
    },
    realmCalls,
    repository: {
      async assign() {
        return { affected: input.assigned ?? [] }
      },
      async grantDirectPermissions(call: Call) {
        savedKeycloakIds.push({ ...call, operation: 'grant' })
      },
      async list() {
        return [GROUP]
      },
      async listDirectPermissions() {
        return ['billing.read']
      },
      async remove() {
        return { keycloakGroupId: 'realm-group-1' }
      },
      async revokeDirectPermissions(call: Call) {
        savedKeycloakIds.push({ ...call, operation: 'revoke' })
      },
      async save() {
        return input.saved ?? GROUP
      },
      async setKeycloakGroupId(call: Call) {
        savedKeycloakIds.push({ ...call, operation: 'setKeycloakGroupId' })
      },
      async unassign() {
        return { affected: input.assigned ?? [] }
      },
    },
    savedKeycloakIds,
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createManageCompanyGroupsUseCase(
    fakes as unknown as Parameters<typeof createManageCompanyGroupsUseCase>[0],
  )
}

describe('grupo — a ordem entre o banco e o realm', () => {
  /**
   * Primeiro o banco, depois o provedor. A ordem inversa deixaria um grupo no Keycloak que ninguém
   * aqui reivindica — o defeito que a tela de reconciliação existe para caçar.
   */
  test('cria aqui, espelha no realm e guarda o id do outro lado', async () => {
    const fakes = createFakes()

    const group = await createUseCase(fakes).save({
      context: CONTEXT,
      correlationId: 'correlation-1',
      description: '',
      name: 'Financeiro',
      permissions: ['billing.read'],
      roles: [],
    })

    expect(fakes.realmCalls[0]).toMatchObject({ name: 'Financeiro', operation: 'createGroup' })
    expect(fakes.savedKeycloakIds[0]).toMatchObject({
      keycloakGroupId: 'realm-group-1',
      operation: 'setKeycloakGroupId',
    })
    expect(group.keycloakGroupId).toBe('realm-group-1')
  })

  /**
   * Recusar a criação porque o Keycloak caiu deixaria a empresa sem trabalhar por causa de um sistema
   * que ela não controla. O grupo vale aqui, e `keycloakGroupId` nulo é o que a tela mostra como
   * pendente.
   */
  test('provedor fora do ar não derruba a operação', async () => {
    const fakes = createFakes({ realmFails: true })

    const group = await createUseCase(fakes).save({
      context: CONTEXT,
      correlationId: 'correlation-1',
      description: '',
      name: 'Financeiro',
      permissions: ['billing.read'],
      roles: [],
    })

    expect(group.id).toBe('group-1')
    expect(group.keycloakGroupId).toBeNull()
    expect(fakes.savedKeycloakIds).toHaveLength(0)
  })

  test('grupo que já existe no realm é renomeado, não criado de novo', async () => {
    const fakes = createFakes({ saved: { ...GROUP, keycloakGroupId: 'realm-group-1' } })

    await createUseCase(fakes).save({
      context: CONTEXT,
      correlationId: 'correlation-1',
      description: '',
      name: 'Financeiro sênior',
      permissions: [],
      roles: [],
    })

    expect(fakes.realmCalls[0]).toMatchObject({ operation: 'renameGroup' })
  })
})

describe('grupo — a trilha que responde pela escalada', () => {
  /**
   * `groups.manage` concede permissão: quem a tem pode se auto-promover, e a decisão foi tomada por
   * escrito. A auditoria é a única coisa que responde por isso depois — sem ela, a permissão
   * aparecida na base não tem autor.
   */
  test('toda escrita grava autor, alvo e o que foi concedido', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).save({
      context: CONTEXT,
      correlationId: 'correlation-1',
      description: '',
      name: 'Financeiro',
      permissions: ['billing.read'],
      roles: ['finance'],
    })

    expect(fakes.audits[0]).toMatchObject({
      action: 'company-group.created',
      actorUserId: CONTEXT.userId,
      companyId: CONTEXT.companyId,
      correlationId: 'correlation-1',
      metadata: { permissions: ['billing.read'], roles: ['finance'] },
    })
  })

  test('editar e criar são ações distintas na trilha', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).save({
      context: CONTEXT,
      correlationId: 'correlation-1',
      description: '',
      groupId: 'group-1',
      name: 'Financeiro',
      permissions: [],
      roles: [],
    })

    expect(fakes.audits[0]).toMatchObject({ action: 'company-group.updated' })
  })

  test('a atribuição grava uma linha por pessoa alcançada', async () => {
    const fakes = createFakes({
      assigned: [
        {
          groupId: 'group-1',
          keycloakGroupId: 'realm-group-1',
          subject: 'sub-1',
          userId: 'user-1',
        },
        {
          groupId: 'group-1',
          keycloakGroupId: 'realm-group-1',
          subject: 'sub-2',
          userId: 'user-2',
        },
      ],
    })

    const result = await createUseCase(fakes).assign({
      context: CONTEXT,
      correlationId: 'correlation-1',
      groupIds: ['group-1'],
      userIds: ['user-1', 'user-2'],
    })

    expect(result.affectedUserIds).toEqual(['user-1', 'user-2'])
    expect(fakes.audits[0]).toMatchObject({
      action: 'company-group.assigned',
      targetIds: ['user-1', 'user-2'],
    })
  })
})

describe('grupo — a filiação no realm', () => {
  test('entrar no grupo aqui entra no grupo lá', async () => {
    const fakes = createFakes({
      assigned: [
        {
          groupId: 'group-1',
          keycloakGroupId: 'realm-group-1',
          subject: 'sub-1',
          userId: 'user-1',
        },
      ],
    })

    await createUseCase(fakes).assign({
      context: CONTEXT,
      correlationId: 'correlation-1',
      groupIds: ['group-1'],
      userIds: ['user-1'],
    })

    expect(fakes.realmCalls[0]).toMatchObject({
      groupId: 'realm-group-1',
      operation: 'addMember',
      subject: 'sub-1',
    })
  })

  /**
   * Sem par no realm ou sem `subject`, não há o que sincronizar — e chamar o provedor com nulo
   * montaria uma URL contra um grupo que não é o nosso.
   */
  test('quem não tem par no realm não vira chamada ao provedor', async () => {
    const fakes = createFakes({
      assigned: [
        { groupId: 'group-1', keycloakGroupId: null, subject: 'sub-1', userId: 'user-1' },
        { groupId: 'group-1', keycloakGroupId: 'realm-group-1', subject: null, userId: 'user-2' },
      ],
    })

    await createUseCase(fakes).assign({
      context: CONTEXT,
      correlationId: 'correlation-1',
      groupIds: ['group-1'],
      userIds: ['user-1', 'user-2'],
    })

    expect(fakes.realmCalls).toHaveLength(0)
  })

  test('sair do grupo aqui sai do grupo lá', async () => {
    const fakes = createFakes({
      assigned: [
        {
          groupId: 'group-1',
          keycloakGroupId: 'realm-group-1',
          subject: 'sub-1',
          userId: 'user-1',
        },
      ],
    })

    await createUseCase(fakes).unassign({
      context: CONTEXT,
      correlationId: 'correlation-1',
      groupId: 'group-1',
      userIds: ['user-1'],
    })

    expect(fakes.realmCalls[0]).toMatchObject({ operation: 'removeMember' })
    expect(fakes.audits[0]).toMatchObject({ action: 'company-group.unassigned' })
  })

  test('lote que não alcançou ninguém é recusa, não sucesso silencioso', async () => {
    const fakes = createFakes({ assigned: [] })

    await expect(
      createUseCase(fakes).assign({
        context: CONTEXT,
        correlationId: 'correlation-1',
        groupIds: ['group-1'],
        userIds: ['user-1'],
      }),
    ).rejects.toThrow()
    expect(fakes.audits).toHaveLength(0)
  })
})

describe('permissão avulsa — a exceção que carrega autor', () => {
  test('conceder grava quem concedeu, no banco e na trilha', async () => {
    const fakes = createFakes()
    const useCase = createManageDirectPermissionsUseCase(
      fakes as unknown as Parameters<typeof createManageDirectPermissionsUseCase>[0],
    )

    await useCase.grant({
      context: CONTEXT,
      correlationId: 'correlation-1',
      permissions: ['billing.read'],
      userId: 'user-1',
    })

    expect(fakes.savedKeycloakIds[0]).toMatchObject({
      grantedByUserId: CONTEXT.userId,
      operation: 'grant',
    })
    expect(fakes.audits[0]).toMatchObject({
      action: 'company-user.permission.granted',
      metadata: { permissions: ['billing.read'] },
      targetIds: ['user-1'],
    })
  })

  test('revogar também deixa rastro', async () => {
    const fakes = createFakes()
    const useCase = createManageDirectPermissionsUseCase(
      fakes as unknown as Parameters<typeof createManageDirectPermissionsUseCase>[0],
    )

    await useCase.revoke({
      context: CONTEXT,
      correlationId: 'correlation-1',
      permissions: ['billing.read'],
      userId: 'user-1',
    })

    expect(fakes.audits[0]).toMatchObject({ action: 'company-user.permission.revoked' })
  })
})
