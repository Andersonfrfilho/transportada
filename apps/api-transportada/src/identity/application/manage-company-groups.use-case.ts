/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { CompanyGroupRepositoryPort, CompanyGroupView } from './company-group.port.js'
import type { GroupAuditPort, GroupRealmGatewayPort } from './company-group.audit.port.js'

type ManageCompanyGroupsDependencies = {
  readonly audit: GroupAuditPort
  readonly realm: GroupRealmGatewayPort
  readonly repository: CompanyGroupRepositoryPort
}

type Actor = { readonly companyId: string; readonly userId: string }

export type SaveGroupInput = {
  readonly context: Actor
  readonly correlationId: string
  readonly description: string
  readonly groupId?: string
  readonly name: string
  readonly permissions: readonly string[]
  readonly roles: readonly CompanyRole[]
}

export type AssignGroupsInput = {
  readonly context: Actor
  readonly correlationId: string
  readonly groupIds: readonly string[]
  readonly userIds: readonly string[]
}

export type ManageCompanyGroupsUseCase = {
  assign(input: AssignGroupsInput): Promise<{ readonly affectedUserIds: readonly string[] }>
  list(input: { readonly context: Actor }): Promise<readonly CompanyGroupView[]>
  remove(input: {
    readonly context: Actor
    readonly correlationId: string
    readonly groupId: string
  }): Promise<void>
  save(input: SaveGroupInput): Promise<CompanyGroupView>
  unassign(input: {
    readonly context: Actor
    readonly correlationId: string
    readonly groupId: string
    readonly userIds: readonly string[]
  }): Promise<{ readonly affectedUserIds: readonly string[] }>
}

/**
 * O grupo vive nos dois lados: aqui, onde ele concede permissão, e no realm, onde ele é a filiação
 * que o token carrega. A escrita é sempre **primeiro no banco**, depois no provedor — sem transação
 * distribuída, é essa ordem que deixa a falha no meio segura: o grupo existe, a tela mostra que ele
 * ainda não foi ao realm, e a sincronização conserta. A ordem inversa deixaria um grupo no Keycloak
 * que ninguém aqui reivindica, que é o defeito que a tela de reconciliação existe para caçar.
 *
 * Toda escrita grava trilha. Quem tem `groups.manage` **pode se auto-promover** — decisão registrada
 * —, e a auditoria é a única coisa que responde por isso depois.
 */
export function createManageCompanyGroupsUseCase({
  audit,
  realm,
  repository,
}: ManageCompanyGroupsDependencies): ManageCompanyGroupsUseCase {
  return {
    async assign({ context, correlationId, groupIds, userIds }) {
      const { affected } = await repository.assign({
        companyId: context.companyId,
        groupIds,
        userIds,
      })
      if (affected.length === 0) throw new CompanyUserNotFoundError()

      for (const change of affected) {
        if (change.keycloakGroupId === null || change.subject === null) continue
        await realm.addMember({ groupId: change.keycloakGroupId, subject: change.subject })
      }

      await audit.record({
        action: 'company-group.assigned',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        targetIds: [...new Set(affected.map((change) => change.userId))],
      })

      return { affectedUserIds: [...new Set(affected.map((change) => change.userId))] }
    },

    list: ({ context }) => repository.list({ companyId: context.companyId }),

    async remove({ context, correlationId, groupId }) {
      const { keycloakGroupId } = await repository.remove({
        companyId: context.companyId,
        groupId,
      })
      if (keycloakGroupId !== null) await realm.deleteGroup({ groupId: keycloakGroupId })

      await audit.record({
        action: 'company-group.removed',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        targetIds: [groupId],
      })
    },

    async save({ context, correlationId, description, groupId, name, permissions, roles }) {
      const group = await repository.save({
        companyId: context.companyId,
        description,
        ...(groupId === undefined ? {} : { groupId }),
        name,
        permissions,
        roles,
      })

      const synchronized = await synchronizeRealmGroup({ group, realm, repository })

      await audit.record({
        action: groupId === undefined ? 'company-group.created' : 'company-group.updated',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        metadata: { permissions: [...permissions], roles: [...roles] },
        targetIds: [group.id],
      })

      return synchronized
    },

    async unassign({ context, correlationId, groupId, userIds }) {
      const { affected } = await repository.unassign({
        companyId: context.companyId,
        groupId,
        userIds,
      })
      if (affected.length === 0) throw new CompanyUserNotFoundError()

      for (const change of affected) {
        if (change.keycloakGroupId === null || change.subject === null) continue
        await realm.removeMember({ groupId: change.keycloakGroupId, subject: change.subject })
      }

      await audit.record({
        action: 'company-group.unassigned',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        targetIds: [...new Set(affected.map((change) => change.userId))],
      })

      return { affectedUserIds: [...new Set(affected.map((change) => change.userId))] }
    },
  }
}

/**
 * O grupo nasce sem par no realm e ganha um na primeira escrita que conseguir falar com o provedor.
 * Provedor fora do ar **não derruba a operação**: o grupo continua valendo aqui, `keycloakGroupId`
 * segue nulo, e a tela diz que a sincronização está pendente. Recusar a criação porque o Keycloak
 * caiu seria deixar a empresa sem poder trabalhar por causa de um sistema que ela não controla.
 */
async function synchronizeRealmGroup(input: {
  readonly group: CompanyGroupView
  readonly realm: GroupRealmGatewayPort
  readonly repository: CompanyGroupRepositoryPort
}): Promise<CompanyGroupView> {
  const { group, realm, repository } = input

  try {
    if (group.keycloakGroupId !== null) {
      await realm.renameGroup({ groupId: group.keycloakGroupId, name: group.name })
      return group
    }

    const { groupId } = await realm.createGroup({ name: group.name })
    await repository.setKeycloakGroupId({ groupId: group.id, keycloakGroupId: groupId })
    return { ...group, keycloakGroupId: groupId }
  } catch {
    return group
  }
}
