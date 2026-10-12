/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, contra Postgres de verdade: as a empresa desligada no meio, a devolução de tentativa na falha de ambiente e o índice do expurgo.
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

describeDatabase('guardas da escrita da transcrição (spec 264 revisão M3/M5/H3)', () => {
  const { database, enabledCompany, insertPending, lineQueue, rowOf } = useAudioIntegrationContext()

  describe('guardas', () => {
    test('markReady refuses to store the text of a company switched off after the claim (M3)', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      const key = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }
      await database.execute(
        sql`update company_audio_transcription_settings set enabled = false where company_id = ${company.companyId}::uuid`,
      )
      const ready = {
        ...key,
        audioDurationMs: 1,
        engine: 'e',
        language: 'pt',
        model: 'm',
        processingMs: 1,
        text: 'segredo',
      }
      expect(await lineQueue.markReady(ready)).toBe(false)
      expect(await rowOf(audio.attachmentId)).toMatchObject({ status: 'pending', text: null })
      expect(
        await lineQueue.markFailed({
          ...key,
          audioDurationMs: null,
          code: 'company_disabled',
          maxDurationMs: null,
        }),
      ).toBe(true)
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        failure_code: 'company_disabled',
        status: 'failed',
        text: null,
      })
    })

    test('an infrastructure retry gives the attempt back and keeps the measured duration', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      const key = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }
      await lineQueue.scheduleRetry({
        ...key,
        audioDurationMs: 4_200,
        delayMilliseconds: 1_800_000,
        shouldGiveBackAttempt: true,
      })
      const row = await rowOf(audio.attachmentId)
      expect(row).toMatchObject({ attempts: 0, lease_token: null, status: 'pending' })
      expect(row?.next_attempt_in_seconds).toBeGreaterThan(1_790)
      const [duration] = (await database.execute(
        sql`select audio_duration_ms from occurrence_conversation_audio_transcriptions where attachment_id = ${audio.attachmentId}::uuid`,
      )) as unknown as readonly { audio_duration_ms: number }[]
      expect(duration?.audio_duration_ms).toBe(4_200)
    })

    test('the purge index exists as a partial index over ready rows with text (M5)', async () => {
      const [index] = (await database.execute(
        sql`select indexdef from pg_indexes where indexname = 'occurrence_conversation_audio_transcriptions_purge_idx'`,
      )) as unknown as readonly { indexdef: string }[]
      expect(index?.indexdef).toContain("status)::text = 'ready'::text")
    })
  })
})
