/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_ID,
  createAddressSuggestionHttpFixture,
  FOREIGN_SUGGESTION_ID,
  SUGGESTION_ID,
  USER_ID,
} from '../fixtures/address-suggestion-http.fixture.js'
import { jsonRequest } from '../fixtures/fleet-http-payload.fixture.js'

const pathOf = (suggestionId: string, verb: string) =>
  `/address-correction-suggestions/${suggestionId}/${verb}`

describe('address correction suggestion routes (spec 294 T3.2)', () => {
  test('apply and dismiss answer 200 with the decided suggestion and run as the token actor', async () => {
    const fixture = await createAddressSuggestionHttpFixture()

    const applied = await fixture.handle(
      jsonRequest({ method: 'POST', path: pathOf(SUGGESTION_ID, 'apply') }),
    )
    const dismissed = await fixture.handle(
      jsonRequest({ method: 'POST', path: pathOf(SUGGESTION_ID, 'dismiss') }),
    )

    expect(applied.status).toBe(200)
    expect(await applied.json()).toEqual({ data: { id: SUGGESTION_ID, status: 'applied' } })
    expect(await dismissed.json()).toEqual({ data: { id: SUGGESTION_ID, status: 'dismissed' } })
    expect(fixture.calls).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        correlationId: expect.any(String),
        suggestionId: SUGGESTION_ID,
        verb: 'apply',
      },
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        correlationId: expect.any(String),
        suggestionId: SUGGESTION_ID,
        verb: 'dismiss',
      },
    ])
  })

  test('another company suggestion answers 404 on both verbs', async () => {
    const fixture = await createAddressSuggestionHttpFixture()

    for (const verb of ['apply', 'dismiss']) {
      const response = await fixture.handle(
        jsonRequest({ method: 'POST', path: pathOf(FOREIGN_SUGGESTION_ID, verb) }),
      )

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        error: { code: 'ADDRESS_CORRECTION_SUGGESTION_NOT_FOUND' },
      })
    }
  })

  test('needs trip.manage, the permission of PATCH /geocoded-addresses/:addressKey', async () => {
    const fixture = await createAddressSuggestionHttpFixture({
      permissions: new Set(['fleet.read', 'settings.manage']),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: pathOf(SUGGESTION_ID, 'apply') }),
    )

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('does not route an id that is not a uuid', async () => {
    const fixture = await createAddressSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: pathOf('not-a-uuid', 'apply') }),
    )

    expect(response.status).toBe(404)
    expect(fixture.calls).toEqual([])
  })
})
