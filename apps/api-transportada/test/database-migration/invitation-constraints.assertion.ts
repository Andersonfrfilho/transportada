import { SQL } from 'bun'
import { expect } from 'bun:test'

import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

const hashOf = (seed: string): string =>
  new Bun.CryptoHasher('sha256').update(seed).digest('hex').toLowerCase()

const inHours = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString()

export async function assertInvitationConstraints(
  database: SQL,
  identity: IdentityFixture,
): Promise<void> {
  const invitationId = crypto.randomUUID()
  const codeHash = hashOf('first-invitation')

  await database`
    insert into user_invitations (id, company_id, user_id, code_hash, expires_at)
    values (${invitationId}, ${identity.companyId}, ${identity.userId}, ${codeHash}, ${inHours(48)})
  `
  await database`
    insert into user_invitation_roles (invitation_id, company_id, role)
    values (${invitationId}, ${identity.companyId}, 'finance'), (${invitationId}, ${identity.companyId}, 'viewer')
  `

  const stored = await database<Array<{ readonly attempt_count: number; readonly status: string }>>`
    select attempt_count, status from user_invitations where id = ${invitationId}
  `
  expect(stored).toEqual([{ attempt_count: 0, status: 'pending' }])

  // Reenvio invalida o anterior: só um convite pendente por pessoa e empresa.
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${hashOf('resend')}, ${inHours(48)})
    `,
    '23505',
    'user_invitations_company_id_user_id_pending_unique',
  )

  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, expires_at)
      values (${identity.companyId}, ${crypto.randomUUID()}, ${hashOf('stranger')}, ${inHours(48)})
    `,
    '23503',
    'user_invitations_membership_fk',
  )
  // Empresa que existe, pessoa que não é dela: o banco recusa sem depender do filtro da query.
  const foreignCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${foreignCompanyId}, 'active')`
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, expires_at)
      values (${foreignCompanyId}, ${identity.userId}, ${hashOf('other-company')}, ${inHours(48)})
    `,
    '23503',
    'user_invitations_membership_fk',
  )
  await database`delete from companies where id = ${foreignCompanyId}`
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${hashOf('bad-status')}, 'expired', ${inHours(48)})
    `,
    '23514',
    'user_invitations_status_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${'ABC123'}, 'revoked', ${inHours(48)})
    `,
    '23514',
    'user_invitations_code_hash_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, attempt_count, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${hashOf('negative')}, 'revoked', -1, ${inHours(48)})
    `,
    '23514',
    'user_invitations_attempt_count_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${hashOf('already-expired')}, 'revoked', ${inHours(-1)})
    `,
    '23514',
    'user_invitations_expires_at_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${hashOf('accepted-without-instant')}, 'accepted', ${inHours(48)})
    `,
    '23514',
    'user_invitations_accepted_at_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitation_roles (invitation_id, company_id, role)
      values (${invitationId}, ${identity.companyId}, 'platform-admin')
    `,
    '23514',
    'user_invitation_roles_role_check',
  )
  await expectQueryToFail(
    database`
      insert into user_invitation_roles (invitation_id, company_id, role)
      values (${invitationId}, ${identity.companyId}, 'finance')
    `,
    '23505',
    'user_invitation_roles_invitation_id_role_pk',
  )
  // O papel pretendido não pode apontar para o convite de outra empresa.
  await expectQueryToFail(
    database`
      insert into user_invitation_roles (invitation_id, company_id, role)
      values (${invitationId}, ${crypto.randomUUID()}, 'operator')
    `,
    '23503',
    'user_invitation_roles_invitation_fk',
  )

  // Convite atendido libera o par pendente e passa a exigir o instante de aceite.
  await database`
    update user_invitations
    set status = 'accepted', accepted_at = now()
    where id = ${invitationId}
  `
  const secondInvitationId = crypto.randomUUID()
  await database`
    insert into user_invitations (id, company_id, user_id, code_hash, expires_at)
    values (${secondInvitationId}, ${identity.companyId}, ${identity.userId}, ${hashOf('second-invitation')}, ${inHours(48)})
  `
  await expectQueryToFail(
    database`
      insert into user_invitations (company_id, user_id, code_hash, status, expires_at)
      values (${identity.companyId}, ${identity.userId}, ${codeHash}, 'revoked', ${inHours(48)})
    `,
    '23505',
    'user_invitations_code_hash_unique',
  )

  // A ativação não é autenticada: ela encontra o convite só pelo hash.
  const byHash = await database<Array<{ readonly company_id: string }>>`
    select company_id from user_invitations where code_hash = ${hashOf('second-invitation')}
  `
  expect(byHash).toEqual([{ company_id: identity.companyId }])

  await database`delete from user_invitations where id in (${invitationId}, ${secondInvitationId})`
  const remainingRoles = await database<Array<{ readonly count: string }>>`
    select count(*)::text as count from user_invitation_roles where invitation_id = ${invitationId}
  `
  expect(remainingRoles).toEqual([{ count: '0' }])
}
