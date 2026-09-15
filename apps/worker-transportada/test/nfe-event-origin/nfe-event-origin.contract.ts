/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveNfeEventOrigin } from '../../src/nfe-documents/domain/nfe-event-origin.policy.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-documents/domain/system-distribution-actor.constant.js'

const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'
const USER_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'

describe('NF-e event origin policy (spec 149 D14)', () => {
  test('an upload is manual, and the user who sent the file is the actor', () => {
    expect(
      resolveNfeEventOrigin({ importId: IMPORT_ID, requestedByUserId: USER_ID, source: 'upload' }),
    ).toEqual({
      actorUserId: USER_ID,
      importId: IMPORT_ID,
      origin: 'manual',
      requestedByUserId: null,
    })
  })

  test('the scheduled distribution is automatic, with neither actor nor requester', () => {
    expect(
      resolveNfeEventOrigin({
        importId: IMPORT_ID,
        requestedByUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
        source: 'distribution',
      }),
    ).toEqual({
      actorUserId: null,
      importId: IMPORT_ID,
      origin: 'automatic',
      requestedByUserId: null,
    })
  })

  test('"fetch now" is automatic, and the user who asked is the requester, never the actor', () => {
    expect(
      resolveNfeEventOrigin({
        importId: IMPORT_ID,
        requestedByUserId: USER_ID,
        source: 'distribution',
      }),
    ).toEqual({
      actorUserId: null,
      importId: IMPORT_ID,
      origin: 'automatic',
      requestedByUserId: USER_ID,
    })
  })

  test('an upload without an actor does not compile', () => {
    // @ts-expect-error — nfe_imports.requested_by_user_id é NOT NULL; upload sem ator não existe
    resolveNfeEventOrigin({ importId: IMPORT_ID, requestedByUserId: null, source: 'upload' })
  })

  test('the worker copy of the system actor is the same id the cron enqueues with', () => {
    expect(SYSTEM_DISTRIBUTION_ACTOR_USER_ID).toBe('00000000-0000-4000-8000-000000000006')
  })
})
