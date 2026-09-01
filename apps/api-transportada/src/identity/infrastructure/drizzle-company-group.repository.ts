/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, inArray } from 'drizzle-orm'

import {
  companyGroupPermissions,
  companyGroupRoles,
  companyGroups,
  externalIdentities,
  membershipGroups,
  membershipPermissions,
  userCompanyMemberships,
  type CompanyRole,
} from '../../database/database.schema'
import type {
  CompanyGroupRepositoryPort,
  CompanyGroupView,
  GroupMembershipChange,
  SaveCompanyGroupInput,
} from '../application/company-group.port.js'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCompanyGroupRepository implements CompanyGroupRepositoryPort {
  public constructor(private readonly database: IdentityDatabase) {}

  /**
   * Criar e editar são a mesma escrita: o conteúdo do grupo é **substituído** por inteiro. Somar
   * papéis aqui, como o lote de usuários faz, tornaria impossível tirar um papel do grupo — e a tela
   * mostra a lista completa, então o que o operador vê é o que ele mandou gravar.
   */
  public async save(input: SaveCompanyGroupInput): Promise<CompanyGroupView> {
    return this.database.transaction(async (transaction) => {
      const groupId = await this.upsertGroup(transaction, input)

      await transaction.delete(companyGroupRoles).where(eq(companyGroupRoles.groupId, groupId))
      await transaction
        .delete(companyGroupPermissions)
        .where(eq(companyGroupPermissions.groupId, groupId))

      if (input.roles.length > 0) {
        await transaction
          .insert(companyGroupRoles)
          .values(input.roles.map((role) => ({ groupId, role })))
      }
      if (input.permissions.length > 0) {
        await transaction
          .insert(companyGroupPermissions)
          .values(input.permissions.map((permission) => ({ groupId, permission })))
      }

      const [group] = await transaction
        .select({
          description: companyGroups.description,
          keycloakGroupId: companyGroups.keycloakGroupId,
          name: companyGroups.name,
        })
        .from(companyGroups)
        .where(eq(companyGroups.id, groupId))

      return {
        description: group?.description ?? input.description,
        id: groupId,
        keycloakGroupId: group?.keycloakGroupId ?? null,
        memberCount: 0,
        name: group?.name ?? input.name,
        permissions: [...input.permissions],
        roles: [...input.roles],
      }
    })
  }

  public async list(input: { readonly companyId: string }): Promise<readonly CompanyGroupView[]> {
    const groups = await this.database
      .select({
        description: companyGroups.description,
        id: companyGroups.id,
        keycloakGroupId: companyGroups.keycloakGroupId,
        name: companyGroups.name,
      })
      .from(companyGroups)
      .where(eq(companyGroups.companyId, input.companyId))
      .orderBy(companyGroups.name)

    if (groups.length === 0) return []

    const groupIds = groups.map((group) => group.id)
    /**
     * Três leituras em vez de um `join` só: papéis, permissões e membros multiplicariam entre si num
     * produto cartesiano, e deduplicar em memória o que o banco devolve separado é trabalho inventado.
     */
    const [roles, permissions, members] = await Promise.all([
      this.database
        .select({ groupId: companyGroupRoles.groupId, role: companyGroupRoles.role })
        .from(companyGroupRoles)
        .where(inArray(companyGroupRoles.groupId, groupIds)),
      this.database
        .select({
          groupId: companyGroupPermissions.groupId,
          permission: companyGroupPermissions.permission,
        })
        .from(companyGroupPermissions)
        .where(inArray(companyGroupPermissions.groupId, groupIds)),
      this.database
        .select({ groupId: membershipGroups.groupId, total: count() })
        .from(membershipGroups)
        .where(inArray(membershipGroups.groupId, groupIds))
        .groupBy(membershipGroups.groupId),
    ])

    return groups.map((group) => ({
      description: group.description,
      id: group.id,
      keycloakGroupId: group.keycloakGroupId,
      memberCount: members.find((member) => member.groupId === group.id)?.total ?? 0,
      name: group.name,
      permissions: permissions
        .filter((entry) => entry.groupId === group.id)
        .map((entry) => entry.permission),
      roles: roles
        .filter((entry) => entry.groupId === group.id)
        .map((entry) => entry.role as CompanyRole),
    }))
  }

  public async remove(input: {
    readonly companyId: string
    readonly groupId: string
  }): Promise<{ readonly keycloakGroupId: string | null }> {
    const [removed] = await this.database
      .delete(companyGroups)
      .where(and(eq(companyGroups.companyId, input.companyId), eq(companyGroups.id, input.groupId)))
      .returning({ keycloakGroupId: companyGroups.keycloakGroupId })

    return { keycloakGroupId: removed?.keycloakGroupId ?? null }
  }

  /**
   * Atribuir **acrescenta**: quem já está no grupo é ignorado pela PK, e repetir o lote converge. O
   * recorte por empresa vem das duas pontas — o grupo é da empresa e a membership também —, senão o
   * id de um grupo alheio ligaria gente daqui a permissão de lá.
   */
  public async assign(input: {
    readonly companyId: string
    readonly groupIds: readonly string[]
    readonly userIds: readonly string[]
  }): Promise<{ readonly affected: readonly GroupMembershipChange[] }> {
    if (input.groupIds.length === 0 || input.userIds.length === 0) return { affected: [] }

    const [memberships, groups] = await Promise.all([
      this.readMemberships(input),
      this.readGroups({ companyId: input.companyId, groupIds: input.groupIds }),
    ])
    if (memberships.length === 0 || groups.length === 0) return { affected: [] }

    await this.database
      .insert(membershipGroups)
      .values(
        memberships.flatMap((membership) =>
          groups.map((group) => ({ groupId: group.id, membershipId: membership.membershipId })),
        ),
      )
      .onConflictDoNothing()

    return { affected: toChanges({ groups, memberships }) }
  }

  public async unassign(input: {
    readonly companyId: string
    readonly groupId: string
    readonly userIds: readonly string[]
  }): Promise<{ readonly affected: readonly GroupMembershipChange[] }> {
    const [memberships, groups] = await Promise.all([
      this.readMemberships(input),
      this.readGroups({ companyId: input.companyId, groupIds: [input.groupId] }),
    ])
    if (memberships.length === 0 || groups.length === 0) return { affected: [] }

    await this.database.delete(membershipGroups).where(
      and(
        eq(membershipGroups.groupId, input.groupId),
        inArray(
          membershipGroups.membershipId,
          memberships.map((membership) => membership.membershipId),
        ),
      ),
    )

    return { affected: toChanges({ groups, memberships }) }
  }

  public async grantDirectPermissions(input: {
    readonly companyId: string
    readonly grantedByUserId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }): Promise<void> {
    if (input.permissions.length === 0) return
    const [membership] = await this.readMemberships({
      companyId: input.companyId,
      userIds: [input.userId],
    })
    if (membership === undefined) return

    await this.database
      .insert(membershipPermissions)
      .values(
        input.permissions.map((permission) => ({
          grantedByUserId: input.grantedByUserId,
          membershipId: membership.membershipId,
          permission,
        })),
      )
      .onConflictDoNothing()
  }

  public async revokeDirectPermissions(input: {
    readonly companyId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }): Promise<void> {
    if (input.permissions.length === 0) return
    const [membership] = await this.readMemberships({
      companyId: input.companyId,
      userIds: [input.userId],
    })
    if (membership === undefined) return

    await this.database
      .delete(membershipPermissions)
      .where(
        and(
          eq(membershipPermissions.membershipId, membership.membershipId),
          inArray(membershipPermissions.permission, [...input.permissions]),
        ),
      )
  }

  public async listDirectPermissions(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<readonly string[]> {
    const [membership] = await this.readMemberships({
      companyId: input.companyId,
      userIds: [input.userId],
    })
    if (membership === undefined) return []

    const rows = await this.database
      .select({ permission: membershipPermissions.permission })
      .from(membershipPermissions)
      .where(eq(membershipPermissions.membershipId, membership.membershipId))

    return rows.map((row) => row.permission)
  }

  public async setKeycloakGroupId(input: {
    readonly groupId: string
    readonly keycloakGroupId: string
  }): Promise<void> {
    await this.database
      .update(companyGroups)
      .set({ keycloakGroupId: input.keycloakGroupId, updatedAt: new Date() })
      .where(eq(companyGroups.id, input.groupId))
  }

  private async upsertGroup(
    transaction: IdentityDatabase,
    input: SaveCompanyGroupInput,
  ): Promise<string> {
    if (input.groupId !== undefined) {
      const [updated] = await transaction
        .update(companyGroups)
        .set({ description: input.description, name: input.name, updatedAt: new Date() })
        .where(
          and(eq(companyGroups.companyId, input.companyId), eq(companyGroups.id, input.groupId)),
        )
        .returning({ id: companyGroups.id })
      if (updated !== undefined) return updated.id
    }

    const [created] = await transaction
      .insert(companyGroups)
      .values({
        companyId: input.companyId,
        description: input.description,
        name: input.name,
      })
      .returning({ id: companyGroups.id })

    return created?.id ?? ''
  }

  /** O `subject` vem junto porque a sincronização com o realm não entende o id interno. */
  private async readMemberships(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<readonly { membershipId: string; subject: string | null; userId: string }[]> {
    if (input.userIds.length === 0) return []

    return this.database
      .select({
        membershipId: userCompanyMemberships.id,
        subject: externalIdentities.subject,
        userId: userCompanyMemberships.userId,
      })
      .from(userCompanyMemberships)
      .leftJoin(externalIdentities, eq(externalIdentities.userId, userCompanyMemberships.userId))
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          inArray(userCompanyMemberships.userId, [...input.userIds]),
        ),
      )
  }

  private async readGroups(input: {
    readonly companyId: string
    readonly groupIds: readonly string[]
  }): Promise<readonly { id: string; keycloakGroupId: string | null }[]> {
    return this.database
      .select({ id: companyGroups.id, keycloakGroupId: companyGroups.keycloakGroupId })
      .from(companyGroups)
      .where(
        and(
          eq(companyGroups.companyId, input.companyId),
          inArray(companyGroups.id, [...input.groupIds]),
        ),
      )
  }
}

function toChanges(input: {
  readonly groups: readonly { id: string; keycloakGroupId: string | null }[]
  readonly memberships: readonly { subject: string | null; userId: string }[]
}): readonly GroupMembershipChange[] {
  return input.memberships.flatMap((membership) =>
    input.groups.map((group) => ({
      groupId: group.id,
      keycloakGroupId: group.keycloakGroupId,
      subject: membership.subject,
      userId: membership.userId,
    })),
  )
}
