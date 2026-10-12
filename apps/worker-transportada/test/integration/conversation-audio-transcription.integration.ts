/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3/T3.4, contra Postgres de verdade: o marco e a janela da descoberta, a varredura de
 * esgotados, a reivindicação (uma linha por vez, `SKIP LOCKED`, tentativa na reivindicação), a posse
 * pelo `lease_token`, o expurgo e o ciclo completo com transcritor, sonda e armazenamento falsos.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { buildAudioTranscriptionRuntime } from '../../src/conversation-audio-transcription/build-audio-transcription-runtime.js'
import {
  createDrizzleAudioTranscriptionCycleQueue,
  type AudioTranscriptionDatabase,
} from '../../src/conversation-audio-transcription/drizzle-audio-transcription-cycle.repository.js'
import { createDrizzleAudioTranscriptionLineQueue } from '../../src/conversation-audio-transcription/drizzle-audio-transcription-line.repository.js'
import {
  AUDIO_FIXTURE_BYTES,
  seedAudioAttachment,
  seedCompany,
  seedSettings,
  type SeededCompany,
} from '../fixtures/audio-transcription-graph.fixture.js'
import {
  createFixedProbe,
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
  flushMicrotasks,
} from '../fixtures/audio-transcription-harness.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const HOUR = 3_600
const LEASE_MS = 495_000
const WINDOW_HOURS = 72

type TranscriptionRow = {
  readonly attempts: number
  readonly failure_code: string | null
  readonly generated_at: Date | null
  readonly lease_token: string | null
  readonly max_duration_ms: number | null
  readonly next_attempt_in_seconds: number
  readonly status: string
  readonly text: string | null
  readonly updated_at: Date
}

describeDatabase('transcrição de áudio da conversa contra o Postgres (spec 264 T3.3/T3.4)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const database = provider.db as AudioTranscriptionDatabase
  const cycleQueue = createDrizzleAudioTranscriptionCycleQueue(database)
  const lineQueue = createDrizzleAudioTranscriptionLineQueue(database)

  beforeEach(async () => {
    // A tabela é só desta suíte neste banco dedicado; a reivindicação é global, então parte do zero.
    await database.execute(sql`delete from occurrence_conversation_audio_transcriptions`)
  })

  async function rowOf(attachmentId: string): Promise<TranscriptionRow | undefined> {
    const rows = (await database.execute(sql`
      select attempts, failure_code, generated_at, lease_token, max_duration_ms, status, text, updated_at,
             extract(epoch from (next_attempt_at - now()))::int as next_attempt_in_seconds
      from occurrence_conversation_audio_transcriptions where attachment_id = ${attachmentId}::uuid
    `)) as unknown as readonly TranscriptionRow[]
    return rows[0]
  }

  async function insertPending(
    company: SeededCompany,
    attachmentId: string,
    set = sql``,
  ): Promise<void> {
    await database.execute(sql`
      insert into occurrence_conversation_audio_transcriptions (company_id, attachment_id, conversation_id, status)
      values (${company.companyId}, ${attachmentId}, ${company.conversationId}, 'pending')
    `)
    if (set.queryChunks.length > 0) {
      await database.execute(
        sql`update occurrence_conversation_audio_transcriptions set ${set} where attachment_id = ${attachmentId}::uuid`,
      )
    }
  }

  async function enabledCompany(
    overrides: { routineStartedAgeSeconds?: number | null } = {},
  ): Promise<SeededCompany> {
    const company = await seedCompany(database)
    await seedSettings(database, {
      companyId: company.companyId,
      enabled: true,
      enabledSinceAgeSeconds: 10 * HOUR,
      routineStartedAgeSeconds: overrides.routineStartedAgeSeconds ?? 10 * HOUR,
    })
    return company
  }

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
      expect(await lineQueue.scheduleRetry({ delayMilliseconds: 1, id, leaseToken: wrong })).toBe(
        false,
      )
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
      expect(await lineQueue.scheduleRetry({ ...key, delayMilliseconds: 300_000 })).toBe(true)
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

  describe('expurgo (RF18, §5.6 passo 7)', () => {
    test('ready with a deleted object loses the text but stays ready, with generated_at kept', async () => {
      const company = await enabledCompany()
      const gone = await seedAudioAttachment(database, {
        ageSeconds: HOUR,
        company,
        objectStatus: 'deleted',
      })
      const kept = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      for (const audio of [gone, kept]) {
        await insertPending(
          company,
          audio.attachmentId,
          sql`status = 'ready', text = 'segredo', generated_at = now() - interval '1 hour'`,
        )
      }
      const before = await rowOf(gone.attachmentId)
      expect(await cycleQueue.purgeDeletedText()).toBe(1)
      const purged = await rowOf(gone.attachmentId)
      expect(purged).toMatchObject({ status: 'ready', text: null })
      expect(purged?.generated_at?.getTime()).toBe(before?.generated_at?.getTime())
      expect(purged?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0)
      expect((await rowOf(kept.attachmentId))?.text).toBe('segredo')
    })
  })

  describe('ciclo completo com o executor (T3.4)', () => {
    test('a new audio is discovered, transcribed by the fake engine and stored; six statements per cycle, two per line', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: 60, company })
      // Sobras de outros testes desta suíte também seriam descobertas: o ciclo é global.
      await database.execute(sql`
        update occurrence_conversation_attachments set content_type = 'application/octet-stream'
        where content_type like 'audio/%' and id <> ${audio.attachmentId}::uuid
      `)
      let statements = 0
      const countingDatabase = {
        execute: (query: never) => {
          statements += 1
          return database.execute(query)
        },
      } as unknown as AudioTranscriptionDatabase
      const logs = createLogCapture()
      const runtime = buildAudioTranscriptionRuntime({
        database: countingDatabase,
        durationProbe: createFixedProbe(3_000),
        environment: {
          batchSize: 2,
          binaryPath: 'whisper-cli',
          language: 'pt',
          maxDurationMilliseconds: 600_000,
          modelPath: '/models/ggml-small-q5_1.bin',
          recoveryWindowHours: WINDOW_HOURS,
          threads: 1,
          timeoutMilliseconds: 300_000,
        },
        logger: logs.logger,
        objectReader: createMapReader({ [audio.objectKey]: AUDIO_FIXTURE_BYTES }),
        speechToText: createInstantTranscriber('olá\u0000 mundo'),
      })
      const result = await runtime.routine.run({
        correlationId: 'c',
        executionId: 'e',
        isStopRequested: () => false,
        job: 'conversation.audio.transcribe',
        origin: 'schedule',
      })
      await flushMicrotasks()
      await flushMicrotasks()
      expect(result.outcome).toBe('completed')
      // 6 do ciclo (marco 2 + varredura + descoberta + expurgo + contagem), 2 da linha (reivindica + grava)
      // e 1 reivindicação vazia que encerra o laço.
      expect(statements).toBe(6 + 2 + 1)
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        attempts: 1,
        status: 'ready',
        text: 'olá mundo',
      })
      expect(JSON.stringify(logs.lines)).not.toContain('olá')
      const summary = runtime.runner.takeSummary()
      expect(summary).toMatchObject({ processed: expect.any(Number), runnerError: 0 })
    })
  })
})
