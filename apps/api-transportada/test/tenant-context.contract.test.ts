/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TenantContextService } from '../src/identity/application/tenant-context.service'
import type { MembershipRepositoryPort } from '../src/identity/application/tenant-context.port'
import type { AuthenticatedIdentity } from '../src/identity/domain/authenticated-identity'
import { ApiError } from '../src/shared/api.error'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000003'

describe('tenant context contract', () => {
  test('creates an immutable company context only from an active local membership', async () => {
    const lookups: Array<{ readonly companyId: string; readonly userId: string }> = []
    const service = createService({
      async findActiveByUserAndCompany(input) {
        lookups.push(input)
        return {
          membershipId: MEMBERSHIP_ID,
          roles: ['fiscal', 'viewer'],
        }
      },
    })
    const identity = authenticatedIdentity()

    const context = await service.resolveCompany(identity)

    expect(lookups).toEqual([{ companyId: COMPANY_ID, userId: USER_ID }])
    expect(context).toEqual({
      identity,
      scope: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: MEMBERSHIP_ID,
        permissions: expect.any(Object),
        roles: ['fiscal', 'viewer'],
        userId: USER_ID,
      },
    })
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.scope)).toBe(true)
    expect(Object.isFrozen(context.scope.roles)).toBe(true)
    expect([...context.scope.permissions]).toEqual([
      'invoices.import',
      'invoices.read',
      'batches.create',
      'batches.approve',
      'freight.simulate',
      'cte.manage',
      'cte.submit',
      'cte.issue',
      'cte.cancel',
      'cte.read',
    ])
    expect(Object.isFrozen(context.scope.permissions)).toBe(true)
  })

  test('snapshots identity so caller mutation cannot change an in-flight context', async () => {
    const service = createService()
    const mutableIdentity: Mutable<AuthenticatedIdentity> = {
      ...authenticatedIdentity(),
    }

    const context = await service.resolveCompany(mutableIdentity)
    mutableIdentity.companyIdClaim = '00000000-0000-4000-8000-000000000099'
    mutableIdentity.platformAdmin = true

    expect(context.identity.companyIdClaim).toBe(COMPANY_ID)
    expect(context.identity.platformAdmin).toBe(false)
    expect(Object.isFrozen(context.identity)).toBe(true)
  })

  test('returns one safe 403 for missing, disabled or cross-company membership', async () => {
    const service = createService({
      async findActiveByUserAndCompany() {
        return null
      },
    })

    const error = await captureError(() => service.resolveCompany(authenticatedIdentity()))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
      status: 403,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
    expect(error).not.toHaveProperty('cause')
  })

  test('never lets platform-admin bypass a missing company membership', async () => {
    let repositoryCalls = 0
    const service = createService({
      async findActiveByUserAndCompany() {
        repositoryCalls += 1
        return null
      },
    })

    const error = await captureError(() =>
      service.resolveCompany(authenticatedIdentity({ platformAdmin: true })),
    )

    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(repositoryCalls).toBe(1)
  })

  test('creates platform context only from the exact verified platform assignment', async () => {
    const service = createService()
    const identity = authenticatedIdentity({ platformAdmin: true })

    const context = service.resolvePlatform(identity)

    expect(context).toEqual({
      identity,
      scope: {
        kind: 'platform',
        userId: USER_ID,
      },
    })
    expect(context.scope).not.toHaveProperty('companyId')
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.scope)).toBe(true)
  })

  test('rejects platform context without the exact verified platform assignment', () => {
    const service = createService()

    expect(() => service.resolvePlatform(authenticatedIdentity())).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Access denied',
        status: 403,
      }),
    )
  })
})

function createService(
  repository: MembershipRepositoryPort = {
    async findActiveByUserAndCompany() {
      return {
        membershipId: MEMBERSHIP_ID,
        roles: ['viewer'],
      }
    },
  },
): TenantContextService {
  return new TenantContextService({ repository })
}

function authenticatedIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-000000000004',
    issuer: 'https://identity.example.test/realms/transportada',
    platformAdmin: false,
    subject: 'keycloak-user',
    userId: USER_ID,
    ...overrides,
  })
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error: unknown) {
    return error
  }

  throw new Error('Expected operation to fail')
}

type Mutable<T> = {
  -readonly [TKey in keyof T]: T[TKey]
}
