/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, contra Postgres de verdade: o marco e a janela da descoberta, a varredura de esgotados e o expurgo.
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
  WINDOW_HOURS,
} from './audio-transcription-integration.support.js'

describeDatabase('marco, descoberta, varredura e expurgo da transcrição (spec 264 T3.3)', () => {
  const {
    backdateUpdatedAt,
    cycleQueue,
    database,
    enabledCompany,
    insertPending,
    lineQueue,
    rowOf,
  } = useAudioIntegrationContext()

  describe('marco e descoberta (RF13, D9)', () => {
    test('a company without a settings row gets one now; a row from a PUT before the routine gets its routine mark', async () => {
      const fresh = await seedCompany(database)
      const early = await seedCompany(database)
      await seedSettings(database, {
        companyId: early.companyId,
        enabled: false,
        enabledSinceAgeSeconds: 5 * HOUR,
        routineStartedAgeSeconds: null,
      })
      await cycleQueue.materializeMilestone()
      const rows = (await database.execute(sql`
        select company_id, enabled, routine_started_at is not null as has_mark,
               extract(epoch from (now() - enabled_since))::int as since_age
        from company_audio_transcription_settings where company_id in (${fresh.companyId}::uuid, ${early.companyId}::uuid)
      `)) as unknown as readonly {
        company_id: string
        enabled: boolean
        has_mark: boolean
        since_age: number
      }[]
      const byCompany = new Map(rows.map((row) => [row.company_id, row]))
      expect(byCompany.get(fresh.companyId)).toMatchObject({ enabled: true, has_mark: true })
      expect(byCompany.get(early.companyId)).toMatchObject({ enabled: false, has_mark: true })
      expect(byCompany.get(early.companyId)?.since_age).toBeGreaterThanOrEqual(5 * HOUR)
    })

    test('creates pending only for audio after the mark, inside the window, of an enabled company', async () => {
      const company = await enabledCompany({ routineStartedAgeSeconds: 2 * HOUR })
      const afterMark = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const beforeMark = await seedAudioAttachment(database, { ageSeconds: 3 * HOUR, company })
      const notAudio = await seedAudioAttachment(database, {
        ageSeconds: HOUR,
        company,
        contentType: 'application/pdf',
      })
      await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS })
      expect((await rowOf(afterMark.attachmentId))?.status).toBe('pending')
      expect(await rowOf(beforeMark.attachmentId)).toBeUndefined()
      expect(await rowOf(notAudio.attachmentId)).toBeUndefined()
    })

    test('a PUT before the routine existed does not backfill: audio between the PUT and the first cycle is skipped', async () => {
      const company = await seedCompany(database)
      await seedSettings(database, {
        companyId: company.companyId,
        enabled: true,
        enabledSinceAgeSeconds: 3 * HOUR,
        routineStartedAgeSeconds: null,
      })
      const between = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await cycleQueue.materializeMilestone()
      await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS })
      expect(await rowOf(between.attachmentId)).toBeUndefined()
      const after = await seedAudioAttachment(database, { ageSeconds: 0, company })
      await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS })
      expect((await rowOf(after.attachmentId))?.status).toBe('pending')
    })

    test('nothing is created for a disabled company or for audio older than the recovery window', async () => {
      const disabled = await seedCompany(database)
      await seedSettings(database, {
        companyId: disabled.companyId,
        enabled: false,
        enabledSinceAgeSeconds: 200 * HOUR,
        routineStartedAgeSeconds: 200 * HOUR,
      })
      const disabledAudio = await seedAudioAttachment(database, {
        ageSeconds: HOUR,
        company: disabled,
      })
      const old = await enabledCompany({ routineStartedAgeSeconds: 200 * HOUR })
      const oldAudio = await seedAudioAttachment(database, { ageSeconds: 100 * HOUR, company: old })
      await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS })
      expect(await rowOf(disabledAudio.attachmentId)).toBeUndefined()
      expect(await rowOf(oldAudio.attachmentId)).toBeUndefined()
    })

    test('on conflict do nothing: discovering again neither duplicates nor resets a finished row', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      expect(
        await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS }),
      ).toBeGreaterThanOrEqual(1)
      await database.execute(
        sql`update occurrence_conversation_audio_transcriptions set status = 'failed', failure_code = 'too_long', max_duration_ms = 600000 where attachment_id = ${audio.attachmentId}::uuid`,
      )
      await cycleQueue.discoverPending({ recoveryWindowHours: WINDOW_HOURS })
      expect((await rowOf(audio.attachmentId))?.status).toBe('failed')
    })
  })

  describe('varredura de esgotados (§5.6 passo 2)', () => {
    test('closes pending with attempts >= 3 and an expired lease, but not one still leased or with attempts left', async () => {
      const company = await enabledCompany()
      const dead = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const leased = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      const fresh = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(
        company,
        dead.attachmentId,
        sql`attempts = 3, lease_token = gen_random_uuid(), lease_expires_at = now() - interval '1 minute'`,
      )
      await insertPending(
        company,
        leased.attachmentId,
        sql`attempts = 3, lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes'`,
      )
      await insertPending(company, fresh.attachmentId, sql`attempts = 2`)
      await backdateUpdatedAt(dead.attachmentId)
      const before = await rowOf(dead.attachmentId)
      expect(await cycleQueue.closeExhausted()).toBe(1)
      const closed = await rowOf(dead.attachmentId)
      expect(closed).toMatchObject({
        failure_code: 'attempts_exhausted',
        lease_token: null,
        status: 'failed',
      })
      expect(closed?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0)
      expect((await rowOf(leased.attachmentId))?.status).toBe('pending')
      expect((await rowOf(fresh.attachmentId))?.status).toBe('pending')
    })

    test('a process killed on every attempt does not spin forever: three claims, then the sweep closes it', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId)
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
        expect(claimed?.attempts).toBe(attempt)
        await database.execute(
          sql`update occurrence_conversation_audio_transcriptions set lease_expires_at = now() - interval '1 second' where attachment_id = ${audio.attachmentId}::uuid`,
        )
      }
      expect(await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })).toBeUndefined()
      expect(await cycleQueue.closeExhausted()).toBe(1)
      expect((await rowOf(audio.attachmentId))?.failure_code).toBe('attempts_exhausted')
    })

    test('the lease of the third attempt survives a long measurement: the sweep does not discard the good result', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      await insertPending(company, audio.attachmentId, sql`attempts = 2`)
      const claimed = await lineQueue.claimNext({ leaseMilliseconds: LEASE_MS })
      expect(claimed?.attempts).toBe(3)
      expect(await cycleQueue.closeExhausted()).toBe(0)
      const ready = await lineQueue.markReady({
        audioDurationMs: 1000,
        engine: 'e',
        id: claimed?.id ?? '',
        language: 'pt',
        leaseToken: claimed?.leaseToken ?? '',
        model: 'm',
        processingMs: 5,
        text: 'ok',
      })
      expect(ready).toBe(true)
      expect((await rowOf(audio.attachmentId))?.status).toBe('ready')
    })
  })
})
