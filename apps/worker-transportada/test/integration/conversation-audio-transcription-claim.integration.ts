/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, contra Postgres de verdade: a reivindicação (uma linha por vez, `SKIP LOCKED`, tentativa na reivindicação) e a posse pelo `lease_token`.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { seedAudioAttachment } from '../fixtures/audio-transcription-graph.fixture.js'
import {
  describeDatabase,
  HOUR,
  LEASE_MS,
  useAudioIntegrationContext,
} from './audio-transcription-integration.support.js'

describeDatabase('reivindicação e posse da transcrição (spec 264 T3.3)', () => {
  const { cycleQueue, database, enabledCompany, insertPending, lineQueue, rowOf } =
    useAudioIntegrationContext()

  describe('reivindicação e posse (§5.6 passos 4-6)', () => {
    test('claims one line at a time with a new token, the attempt counted and the lease set', async () => {
      const company = await enabledCompany()
      const first = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const second = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, first.attachmentId)
      await insertPending(company, second.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      expect(claimed).toMatchObject({
        attempts: 1,
        isCompanyEnabled: true,
        mimeType: 'audio/webm',
        objectStatus: 'final',
      })
      expect(claimed?.leaseToken).toMatch(/^[0-9a-f-]{36}$/u)
      const other = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      expect(other?.id).not.toBe(claimed?.id)
      expect(await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })).toBeUndefined()
    })

    test('two executions claiming at the same time never get the same line', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const results = await Promise.all([
        lineQueue.claimNext({ leaseMilliseconds: LEASE_MS }),
        lineQueue.claimNext({ leaseMilliseconds: LEASE_MS }),
        lineQueue.claimNext({ leaseMilliseconds: LEASE_MS }),
      ])
      expect(results.filter((result) => result !== undefined)).toHaveLength(1)
      expect((await rowOf(audio.attachmentId))?.attempts).toBe(1)
    })

    test('does not claim attempts >= 3, a backoff in the future or a line whose lease is alive', async () => {
      const company = await enabledCompany()
      const spent = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const later = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const busy = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, spent.attachmentId, sql`attempts = 3`)
      await insertPending(
        company,
        later.attachmentId,
        sql`next_attempt_at = now() + interval '5 minutes'`,
      )
      await insertPending(
        company,
        busy.attachmentId,
        sql`lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes'`,
      )
      expect(await cycleQueue.countClaimable()).toBe(0)
      expect(await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })).toBeUndefined()
    })

    test('a line whose object was deleted is still returned, flagged as deleted (the join never drops it)', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, {
        ageSeconds: HOUR,
        company,
        objectStatus: 'deleted',
      })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      expect(claimed).toMatchObject({ attempts: 1, objectStatus: 'deleted' })
    })
  })
})
