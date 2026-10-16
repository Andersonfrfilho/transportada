/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: quem pode ser responsável por ocorrência — membro ativo com `occurrences.resolve` (papel, grupo ou
 * concessão direta, a mesma união do `tenant-context`) e o endereço do perfil. Seis consultas em lote.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import type { CompanyRole } from '../../database/database.schema.js'
import {
  companyGroupPermissions,
  companyGroupRoles,
  identityUserProfiles,
  membershipGroups,
  membershipPermissions,
  membershipRoles,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { resolveCompanyPermissions } from '../../identity/domain/authorization.policy.js'
import type { OccurrenceWatcherUser } from '../application/occurrence-watcher.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

function groupBy<TRow, TValue>(
  rows: readonly TRow[],
  key: (row: TRow) => string,
  value: (row: TRow) => TValue,
): Map<string, TValue[]> {
  const grouped = new Map<string, TValue[]>()
  for (const row of rows) {
    const list = grouped.get(key(row)) ?? []
    list.push(value(row))
    grouped.set(key(row), list)
  }
  return grouped
}

export async function findOccurrenceWatcherUsers(
  database: Database,
  params: { readonly companyId: string; readonly userIds?: readonly string[] },
): Promise<readonly OccurrenceWatcherUser[]> {
  if (params.userIds?.length === 0) return []
  const memberships = await database
    .select({ id: userCompanyMemberships.id, userId: userCompanyMemberships.userId })
    .from(userCompanyMemberships)
    .where(
      and(
        eq(userCompanyMemberships.companyId, params.companyId),
        eq(userCompanyMemberships.status, 'active'),
        params.userIds === undefined
          ? undefined
          : inArray(userCompanyMemberships.userId, [...params.userIds]),
      ),
    )
  if (memberships.length === 0) return []
  const membershipIds = memberships.map((membership) => membership.id)
  const userIds = memberships.map((membership) => membership.userId)

  const [profiles, roles, direct, groupRoles, groupPermissions] = await Promise.all([
    database
      .select({
        address: identityUserProfiles.contactAddress,
        channel: identityUserProfiles.contactChannel,
        name: identityUserProfiles.name,
        userId: identityUserProfiles.userId,
      })
      .from(identityUserProfiles)
      .where(inArray(identityUserProfiles.userId, userIds)),
    database
      .select({ membershipId: membershipRoles.membershipId, role: membershipRoles.role })
      .from(membershipRoles)
      .where(inArray(membershipRoles.membershipId, membershipIds)),
    database
      .select({
        membershipId: membershipPermissions.membershipId,
        permission: membershipPermissions.permission,
      })
      .from(membershipPermissions)
      .where(inArray(membershipPermissions.membershipId, membershipIds)),
    database
      .select({ membershipId: membershipGroups.membershipId, role: companyGroupRoles.role })
      .from(membershipGroups)
      .innerJoin(companyGroupRoles, eq(companyGroupRoles.groupId, membershipGroups.groupId))
      .where(inArray(membershipGroups.membershipId, membershipIds)),
    database
      .select({
        membershipId: membershipGroups.membershipId,
        permission: companyGroupPermissions.permission,
      })
      .from(membershipGroups)
      .innerJoin(
        companyGroupPermissions,
        eq(companyGroupPermissions.groupId, membershipGroups.groupId),
      )
      .where(inArray(membershipGroups.membershipId, membershipIds)),
  ])

  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]))
  const rolesByMembership = groupBy(
    [...roles, ...groupRoles],
    (row) => row.membershipId,
    (row) => row.role as CompanyRole,
  )
  const grantedByMembership = groupBy(
    [...direct, ...groupPermissions],
    (row) => row.membershipId,
    (row) => row.permission,
  )

  return memberships.flatMap((membership) => {
    const profile = profileByUser.get(membership.userId)
    if (profile === undefined) return []
    const permissions = resolveCompanyPermissions({
      granted: grantedByMembership.get(membership.id) ?? [],
      roles: rolesByMembership.get(membership.id) ?? [],
    })
    return [
      {
        address: profile.channel === 'email' ? profile.address.trim() : undefined,
        canResolve: permissions.has('occurrences.resolve'),
        name: profile.name,
        userId: membership.userId,
      },
    ]
  })
}
