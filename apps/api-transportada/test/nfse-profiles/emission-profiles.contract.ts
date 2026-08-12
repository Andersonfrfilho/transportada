/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  PROFILE_DETAIL,
  PROFILE_ID,
  PROFILE_SETTINGS,
  READ_ONLY_CONTEXT,
  createNfseProfilesHttpFixture,
  getRequest,
  jsonRequest,
} from '../fixtures/nfse-profiles-http.fixture'

describe('NFS-e emission profile routes contract', () => {
  test('lists profiles for the authenticated company with the shared page envelope', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(getRequest('/nfse-emission-profiles?limit=10'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: [PROFILE_DETAIL],
      page: { nextCursor: null },
    })
    expect(fixture.listCalls).toEqual([
      { context: { ...COMPANY_CONTEXT, permissions: expect.any(Object) }, cursor: null, limit: 10 },
    ])
  })

  test('creates a profile from the authenticated context and the idempotency key header', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: PROFILE_SETTINGS, method: 'POST', path: '/nfse-emission-profiles' }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: PROFILE_DETAIL })
    expect(fixture.createCalls).toHaveLength(1)
    expect(fixture.createCalls[0]).toMatchObject({
      idempotencyKey: 'nfse-profile-contract-key-0001',
      settings: PROFILE_SETTINGS,
    })
  })

  /** `companyId` vem do contexto autenticado — nunca do corpo, mesmo quando o cliente insiste. */
  test('rejects a body carrying unknown fields, including a client-supplied companyId', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...PROFILE_SETTINGS, companyId: '00000000-0000-4000-8000-0000000000ff' },
        method: 'POST',
        path: '/nfse-emission-profiles',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('rejects a create without the idempotency key header', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      new Request('http://localhost/nfse-emission-profiles', {
        body: JSON.stringify(PROFILE_SETTINGS),
        headers: {
          authorization: 'Bearer nfse-profiles-contract',
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('updates a profile under optimistic concurrency', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', settings: PROFILE_SETTINGS },
        method: 'PATCH',
        path: `/nfse-emission-profiles/${PROFILE_ID}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { ...PROFILE_DETAIL, version: '2' } })
    expect(fixture.updateCalls[0]).toMatchObject({
      expectedVersion: '1',
      profileId: PROFILE_ID,
      settings: PROFILE_SETTINGS,
    })
  })

  test('routes the status transition to activation or deactivation by the requested status', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const activated = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', status: 'active' },
        method: 'PATCH',
        path: `/nfse-emission-profiles/${PROFILE_ID}/status`,
      }),
    )
    const deactivated = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '2', status: 'inactive' },
        method: 'PATCH',
        path: `/nfse-emission-profiles/${PROFILE_ID}/status`,
      }),
    )

    expect(await activated.json()).toEqual({
      data: { ...PROFILE_DETAIL, status: 'active', version: '2' },
    })
    expect(await deactivated.json()).toEqual({
      data: { ...PROFILE_DETAIL, status: 'inactive', version: '3' },
    })
    expect(fixture.activateCalls[0]).toMatchObject({ expectedVersion: '1', profileId: PROFILE_ID })
    expect(fixture.deactivateCalls[0]).toMatchObject({
      expectedVersion: '2',
      profileId: PROFILE_ID,
    })
    expect(fixture.activateCalls[0]).not.toHaveProperty('status')
    expect(fixture.deactivateCalls[0]).not.toHaveProperty('status')
  })

  test('denies every profile route without settings.manage', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const list = await fixture.handle(getRequest('/nfse-emission-profiles'))
    const create = await fixture.handle(
      jsonRequest({ body: PROFILE_SETTINGS, method: 'POST', path: '/nfse-emission-profiles' }),
    )
    const status = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', status: 'active' },
        method: 'PATCH',
        path: `/nfse-emission-profiles/${PROFILE_ID}/status`,
      }),
    )

    expect([list.status, create.status, status.status]).toEqual([403, 403, 403])
    expect(fixture.listCalls).toHaveLength(0)
    expect(fixture.createCalls).toHaveLength(0)
    expect(fixture.activateCalls).toHaveLength(0)
  })
})
