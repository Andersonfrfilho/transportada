/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235: o rollback do papel `helper` e de `fleet_drivers.can_drive` recusa enquanto houver
 * vínculo, convite ou grupo com o papel, ou ficha que não dirige — estreitar o CHECK quebraria, e
 * apagar a linha para caber tiraria o acesso de alguém sem ninguém decidir. Cada sonda é desfeita
 * logo depois, porque a integração roda todos os rollbacks em ordem reversa ao fim.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const HELPER_ROLE_MIGRATION_SUFFIX = '_helper_role_and_can_drive'

const MEMBERSHIP_REFUSAL_MESSAGE = 'membership_roles has helper rows, refusing rollback'
const INVITATION_REFUSAL_MESSAGE = 'user_invitation_roles has helper rows, refusing rollback'
const GROUP_REFUSAL_MESSAGE = 'company_group_roles has helper rows, refusing rollback'
const DRIVER_REFUSAL_MESSAGE = 'fleet_drivers has can_drive = false rows, refusing rollback'

export type HelperRoleRollbackProbe = {
  readonly companyId: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly driverId: string
  readonly membershipId: string
  readonly userId: string
}

async function expectRollbackRefusal(
  database: SQL,
  rollback: string,
  message: string,
): Promise<void> {
  let refusal: unknown
  try {
    await database.unsafe(rollback)
  } catch (error) {
    refusal = error
  }
  await database.unsafe('ROLLBACK')

  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(message)
}

export async function assertHelperRoleRollbackRefusesHelpers(
  probe: HelperRoleRollbackProbe,
): Promise<void> {
  const directory = probe.directories.find((name) => name.endsWith(HELPER_ROLE_MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('Helper role migration is required')
  }
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  const { companyId, database, driverId, membershipId, userId } = probe

  await database`insert into membership_roles (membership_id, role) values (${membershipId}, 'helper')`
  await expectRollbackRefusal(database, rollback, MEMBERSHIP_REFUSAL_MESSAGE)
  await database`delete from membership_roles where membership_id = ${membershipId} and role = 'helper'`

  const invitationId = crypto.randomUUID()
  const codeHash = new Bun.CryptoHasher('sha256').update('helper-rollback').digest('hex')
  const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString()
  await database`
    insert into user_invitations (id, company_id, user_id, code_hash, expires_at)
    values (${invitationId}, ${companyId}, ${userId}, ${codeHash}, ${expiresAt})
  `
  await database`
    insert into user_invitation_roles (invitation_id, company_id, role)
    values (${invitationId}, ${companyId}, 'helper')
  `
  await expectRollbackRefusal(database, rollback, INVITATION_REFUSAL_MESSAGE)
  await database`delete from user_invitations where id = ${invitationId}`

  const groupId = crypto.randomUUID()
  await database`insert into company_groups (id, company_id, name) values (${groupId}, ${companyId}, 'Ajudantes')`
  await database`insert into company_group_roles (group_id, role) values (${groupId}, 'helper')`
  await expectRollbackRefusal(database, rollback, GROUP_REFUSAL_MESSAGE)
  await database`delete from company_groups where id = ${groupId}`

  await database`update fleet_drivers set can_drive = false, can_act_as_helper = true where id = ${driverId}`
  await expectRollbackRefusal(database, rollback, DRIVER_REFUSAL_MESSAGE)
  await database`update fleet_drivers set can_drive = true, can_act_as_helper = false where id = ${driverId}`
}
