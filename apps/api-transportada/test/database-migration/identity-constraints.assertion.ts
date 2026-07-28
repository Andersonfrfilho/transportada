import { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

export type IdentityFixture = Readonly<{
  companyId: string
  membershipId: string
  userId: string
}>

export async function assertIdentityConstraints(database: SQL): Promise<IdentityFixture> {
  const userId = crypto.randomUUID()
  const companyId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()

  await database`insert into identity_users (id, status) values (${userId}, 'active')`
  await database`
    insert into external_identities (user_id, issuer, subject)
    values (${userId}, 'http://localhost:58080/realms/transportada-local', 'local-user')
  `
  await database`insert into companies (id, status) values (${companyId}, 'active')`
  await database`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${membershipId}, ${userId}, ${companyId}, 'active')
  `
  await database`
    insert into membership_roles (membership_id, role)
    values (${membershipId}, 'finance'), (${membershipId}, 'fiscal')
  `

  const roles = await database<Array<{ readonly role: string }>>`
    select role from membership_roles where membership_id = ${membershipId} order by role
  `
  expect(roles).toEqual([{ role: 'finance' }, { role: 'fiscal' }])

  await database`insert into membership_roles (membership_id, role) values (${membershipId}, 'driver')`
  const withDriver = await database<Array<{ readonly role: string }>>`
    select role from membership_roles where membership_id = ${membershipId} and role = 'driver'
  `
  expect(withDriver).toEqual([{ role: 'driver' }])
  await database`delete from membership_roles where membership_id = ${membershipId} and role = 'driver'`

  await expectQueryToFail(
    database`
      insert into external_identities (user_id, issuer, subject)
      values (${userId}, 'http://localhost:58080/realms/transportada-local', 'local-user')
    `,
    '23505',
    'external_identities_issuer_subject_unique',
  )
  await expectQueryToFail(
    database`
      insert into external_identities (user_id, issuer, subject)
      values (${userId}, ${'\t\n'}, ${'\u00a0'})
    `,
    '23514',
    'external_identities_issuer_subject_not_blank_check',
  )
  await expectQueryToFail(
    database`
      insert into user_company_memberships (user_id, company_id, status)
      values (${crypto.randomUUID()}, ${companyId}, 'active')
    `,
    '23503',
    'user_company_memberships_user_id_identity_users_id_fkey',
  )
  await expectQueryToFail(
    database`
      insert into user_company_memberships (user_id, company_id, status)
      values (${userId}, ${crypto.randomUUID()}, 'active')
    `,
    '23503',
    'user_company_memberships_company_id_companies_id_fkey',
  )
  await expectQueryToFail(
    database`
      insert into user_company_memberships (user_id, company_id, status)
      values (${userId}, ${companyId}, 'active')
    `,
    '23505',
    'user_company_memberships_user_company_unique',
  )
  await expectQueryToFail(
    database`insert into identity_users (id, status) values (${crypto.randomUUID()}, 'pending')`,
    '23514',
    'identity_users_status_check',
  )
  await expectQueryToFail(
    database`insert into companies (id, status) values (${crypto.randomUUID()}, 'pending')`,
    '23514',
    'companies_status_check',
  )
  await expectQueryToFail(
    database`
      insert into membership_roles (membership_id, role)
      values (${membershipId}, 'platform-admin')
    `,
    '23514',
    'membership_roles_role_check',
  )
  await expectQueryToFail(
    database`
      insert into membership_roles (membership_id, role)
      values (${membershipId}, 'finance')
    `,
    '23505',
    'membership_roles_membership_id_role_pk',
  )

  return { companyId, membershipId, userId }
}
