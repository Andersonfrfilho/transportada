/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildCompanyAdministratorFilters,
  buildInvitationAttemptFilters,
  buildInvitationCodeFilters,
  buildInvitationRoleFilters,
  buildInvitationUserFilters,
  buildInvitationWriteFilters,
} from '../../src/identity/infrastructure/drizzle-invitation.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const INVITATION_ID = '00000000-0000-4000-8000-000000000902'
const USER_ID = '00000000-0000-4000-8000-000000000903'
const CODE_HASH = 'a'.repeat(64)

const dialect = new PgDialect()

const toQuery = (filters: readonly SQL[]) => dialect.sqlToQuery(and(...filters)!)

describe('user invitation query tenant safety', () => {
  test('scopes the resend lookup by company before user', () => {
    const query = toQuery(buildInvitationUserFilters({ companyId: COMPANY_ID, userId: USER_ID }))

    expect(query.sql).toContain('"user_invitations"."company_id" = $')
    expect(query.sql).toContain('"user_invitations"."user_id" = $')
    expect(query.params).toEqual([COMPANY_ID, USER_ID])
  })

  test('scopes every write by company and invitation', () => {
    const query = toQuery(
      buildInvitationWriteFilters({ companyId: COMPANY_ID, invitationId: INVITATION_ID }),
    )

    expect(query.sql).toContain('"user_invitations"."company_id" = $')
    expect(query.sql).toContain('"user_invitations"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, INVITATION_ID])
  })

  test('scopes the intended roles by company as well as by invitation', () => {
    const query = toQuery(
      buildInvitationRoleFilters({ companyId: COMPANY_ID, invitationId: INVITATION_ID }),
    )

    expect(query.sql).toContain('"user_invitation_roles"."company_id" = $')
    expect(query.sql).toContain('"user_invitation_roles"."invitation_id" = $')
    expect(query.params).toEqual([COMPANY_ID, INVITATION_ID])
  })

  test('lists the administrators of one company only, and only the active memberships', () => {
    const query = toQuery(buildCompanyAdministratorFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"user_company_memberships"."company_id" = $')
    expect(query.sql).toContain('"user_company_memberships"."status" = $')
    expect(query.sql).toContain('"membership_roles"."role" = $')
    expect(query.params).toEqual([COMPANY_ID, 'active', 'company-admin'])
  })

  test('carries no company on the activation lookup, which has no authenticated context', () => {
    const query = toQuery(buildInvitationCodeFilters({ codeHash: CODE_HASH }))

    expect(query.sql).toBe('"user_invitations"."code_hash" = $1')
    expect(query.params).toEqual([CODE_HASH])
  })

  test('counts a failed attempt on one pending invitation, never on a whole company', () => {
    const query = toQuery(buildInvitationAttemptFilters({ invitationId: INVITATION_ID }))

    expect(query.sql).toContain('"user_invitations"."id" = $')
    expect(query.sql).toContain('"user_invitations"."status" = $')
    expect(query.params).toEqual([INVITATION_ID, 'pending'])
  })

  test('never lets a filter reach the database without a bound parameter', () => {
    const queries = [
      toQuery(buildInvitationUserFilters({ companyId: COMPANY_ID, userId: USER_ID })),
      toQuery(buildInvitationWriteFilters({ companyId: COMPANY_ID, invitationId: INVITATION_ID })),
      toQuery(buildInvitationRoleFilters({ companyId: COMPANY_ID, invitationId: INVITATION_ID })),
      toQuery(buildCompanyAdministratorFilters({ companyId: COMPANY_ID })),
      toQuery(buildInvitationCodeFilters({ codeHash: CODE_HASH })),
    ]

    for (const query of queries) {
      expect(query.params.length).toBeGreaterThan(0)
      expect(query.sql).not.toContain(COMPANY_ID)
      expect(query.sql).not.toContain(CODE_HASH)
    }
  })
})
