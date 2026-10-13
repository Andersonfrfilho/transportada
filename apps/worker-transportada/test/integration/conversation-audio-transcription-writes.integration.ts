/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, contra Postgres de verdade: as escritas guardadas pelo `lease_token`, `updated_at`, devolução de tentativa e a empresa desligada no meio.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  seedAudioAttachment,
  seedCompany,
  seedSettings,
} from '../fixtures/audio-transcription-graph.fixture.js'
import {
  describeDatabase,
  HOUR,
  LEASE_MS,
  useAudioIntegrationContext,
} from './audio-transcription-integration.support.js'

describeDatabase('escritas guardadas pela posse da transcrição (spec 264 T3.3)', () => {
  const { backdateUpdatedAt, database, enabledCompany, insertPending, lineQueue, rowOf } =
    useAudioIntegrationContext()

  describe('escritas guardadas pela posse (§5.6 passos 5-6)', () => {
    test('only the holder of the lease token writes; the loser changes nothing', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      const id = claimed?.id ?? ''
      const wrong = crypto.randomUUID()
      const ready = {
        audioDurationMs: 1,
        engine: 'e',
        id,
        language: 'pt',
        model: 'm',
        processingMs: 1,
        text: 'x',
      }
      expect(await lineQueue.markReady({ ...ready, leaseToken: wrong })).toBe(false)
      expect(
        await lineQueue.markFailed({
          audioDurationMs: null,
          code: 'engine_failed',
          id,
          leaseToken: wrong,
          maxDurationMs: null,
        }),
      ).toBe(false)
      expect(
        await lineQueue.scheduleRetry({
          audioDurationMs: null,
          delayMilliseconds: 1,
          id,
          leaseToken: wrong,
          shouldGiveBackAttempt: false,
        }),
      ).toBe(false)
      expect(await lineQueue.release({ id, leaseToken: wrong })).toBe(false)
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        attempts: 1,
        status: 'pending',
        text: null,
      })
    })

    test('ready stores the text, stamps generated_at and moves updated_at; the token is cleared', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      await backdateUpdatedAt(audio.attachmentId)
      const before = await rowOf(audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      await lineQueue.markReady({
        audioDurationMs: 4000,
        engine: 'whisper',
        id: claimed?.id ?? '',
        language: 'pt',
        leaseToken: claimed?.leaseToken ?? '',
        model: 'small',
        processingMs: 900,
        text: 'texto',
      })
      const after = await rowOf(audio.attachmentId)
      expect(after).toMatchObject({ lease_token: null, status: 'ready', text: 'texto' })
      expect(after?.generated_at).not.toBeNull()
      expect(after?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0)
    })

    test('too_long keeps the ceiling that was applied, and the CHECK ties the two together', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      await lineQueue.markFailed({
        audioDurationMs: 700_000,
        code: 'too_long',
        id: claimed?.id ?? '',
        leaseToken: claimed?.leaseToken ?? '',
        maxDurationMs: 600_000,
      })
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        failure_code: 'too_long',
        max_duration_ms: 600_000,
        status: 'failed',
      })
    })

    test('retry keeps pending, clears the lease and schedules the backoff; release gives the attempt back', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      const key = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }
      expect(
        await lineQueue.scheduleRetry({
          ...key,
          audioDurationMs: null,
          delayMilliseconds: 300_000,
          shouldGiveBackAttempt: false,
        }),
      ).toBe(true)
      const retried = await rowOf(audio.attachmentId)
      expect(retried).toMatchObject({ attempts: 1, lease_token: null, status: 'pending' })
      expect(retried?.next_attempt_in_seconds).toBeGreaterThan(290)
      await database.execute(
        sql`update occurrence_conversation_audio_transcriptions set next_attempt_at = now() where attachment_id = ${audio.attachmentId}::uuid`,
      )
      const again = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      expect(again?.attempts).toBe(2)
      expect(
        await lineQueue.release({ id: again?.id ?? '', leaseToken: again?.leaseToken ?? '' }),
      ).toBe(true)
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        attempts: 1,
        lease_token: null,
        status: 'pending',
      })
    })

    test('a disabled company is reported on the claim so the line closes without the engine', async () => {
      const company = await seedCompany(database)
      await seedSettings(database, {
        companyId: company.companyId,
        enabled: false,
        enabledSinceAgeSeconds: 10 * HOUR,
        routineStartedAgeSeconds: 10 * HOUR,
      })
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      expect((await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS }))?.isCompanyEnabled).toBe(
        false,
      )
    })
  })
})
