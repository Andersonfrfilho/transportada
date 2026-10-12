/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3/T3.4 contra Postgres de verdade: a descoberta com marco e janela, a reivindicação
 * `SKIP LOCKED` sob concorrência, o filtro de 3 tentativas, a varredura de esgotados e a posse pelo
 * `lease_token`. O que o fake em memória só imita, aqui o banco decide.
 */
import { createHash } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleAudioTranscriptionQueue } from '../../src/conversation-audio-transcription/infrastructure/drizzle-audio-transcription-queue.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const LEASE_MS = 600_000

describeDatabase('fila de transcrição de áudio (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const queue = createDrizzleAudioTranscriptionQueue(db)
  const companyIds: string[] = []

  type Seeded = {
    readonly attachmentId: string
    readonly companyId: string
    readonly storedObjectId: string
  }

  async function seedCompany(): Promise<{
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
  }> {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const occurrenceId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    companyIds.push(companyId)
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
    )
    await db.execute(sql`
      insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
      values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})
    `)
    await db.execute(sql`
      insert into occurrence_conversation_messages (id, company_id, conversation_id, channel, direction, author_user_id, body_text, status, status_times)
      values (${messageId}, ${companyId}, ${conversationId}, 'app', 'outbound', ${userId}, '', 'sent', '{}'::jsonb)
    `)
    return { companyId, conversationId, messageId }
  }

  async function seedAudio(
    company: Awaited<ReturnType<typeof seedCompany>>,
    options: {
      readonly ageHours?: number
      readonly deleted?: boolean
      readonly contentType?: string
    } = {},
  ): Promise<Seeded> {
    const storedObjectId = crypto.randomUUID()
    const key = `occurrence-conversations/${crypto.randomUUID().replaceAll('-', '')}`
    const sha256 = createHash('sha256').update(key).digest('hex')
    await db.execute(sql`
      insert into stored_objects (id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose, deleted_at)
      values (${storedObjectId}, ${company.companyId}, 's3', 'bucket', ${key}, 'audio/ogg', 10, ${sha256}, ${options.deleted === true ? 'deleted' : 'final'}, 'occurrence_conversation_attachment', ${options.deleted === true ? sql`now()` : null})
    `)
    const [row] = (await db.execute(sql`
      insert into occurrence_conversation_attachments (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name, created_at)
      values (${company.companyId}, ${company.messageId}, ${storedObjectId}, ${sha256}, 10, ${options.contentType ?? 'audio/ogg'}, 'a.ogg', now() - make_interval(hours => ${options.ageHours ?? 0}::int))
      returning id
    `)) as unknown as readonly { id: string }[]
    return { attachmentId: row?.id ?? '', companyId: company.companyId, storedObjectId }
  }

  async function transcription(attachmentId: string) {
    const [row] = (await db.execute(sql`
      select status, attempts, failure_code, lease_token, text, max_duration_ms, audio_duration_ms,
             updated_at, next_attempt_at
      from occurrence_conversation_audio_transcriptions where attachment_id = ${attachmentId}::uuid
    `)) as unknown as readonly Record<string, unknown>[]
    return row
  }

  async function insertPending(
    company: Awaited<ReturnType<typeof seedCompany>>,
    overrides: { readonly attempts?: number; readonly leaseExpiredAgoMinutes?: number } = {},
  ): Promise<Seeded> {
    const audio = await seedAudio(company)
    await db.execute(sql`
      insert into occurrence_conversation_audio_transcriptions
        (company_id, attachment_id, conversation_id, status, attempts, next_attempt_at, lease_token, lease_expires_at)
      values (${company.companyId}, ${audio.attachmentId}, ${company.conversationId}, 'pending',
        ${overrides.attempts ?? 0}::int, '2000-01-01T00:00:00Z'::timestamptz,
        ${overrides.leaseExpiredAgoMinutes === undefined ? null : crypto.randomUUID()}::uuid,
        ${overrides.leaseExpiredAgoMinutes === undefined ? null : sql`now() - make_interval(mins => ${overrides.leaseExpiredAgoMinutes}::int)`})
    `)
    return audio
  }

  beforeAll(async () => {
    await queue.materializeMarker()
  })

  afterAll(async () => {
    await provider.close()
  })

  test('descoberta: só áudio criado depois do marco, de empresa ligada e dentro da janela de 72 h', async () => {
    const company = await seedCompany()
    const recent = await seedAudio(company)
    const notAudio = await seedAudio(company, { contentType: 'image/png' })
    const old = await seedAudio(company, { ageHours: 100 })
    const deleted = await seedAudio(company, { deleted: true })

    const disabledCompany = await seedCompany()
    const disabledAudio = await seedAudio(disabledCompany)
    await queue.materializeMarker()
    await db.execute(
      sql`update company_audio_transcription_settings set enabled = false where company_id = ${disabledCompany.companyId}::uuid`,
    )
    // o marco da empresa é o instante em que a rotina a viu: tudo que é anterior fica de fora
    await db.execute(sql`
      update company_audio_transcription_settings
      set enabled_since = now() - interval '200 hours', routine_started_at = now() - interval '200 hours'
      where company_id = ${company.companyId}::uuid
    `)

    const first = await queue.discoverPending({ recoveryWindowHours: 72 })
    expect(first.created).toBeGreaterThanOrEqual(1)
    expect((await transcription(recent.attachmentId))?.status).toBe('pending')
    expect(await transcription(notAudio.attachmentId)).toBeUndefined()
    expect(await transcription(old.attachmentId)).toBeUndefined()
    expect(await transcription(deleted.attachmentId)).toBeUndefined()
    expect(await transcription(disabledAudio.attachmentId)).toBeUndefined()

    const second = await queue.discoverPending({ recoveryWindowHours: 72 })
    const own = await db.execute(
      sql`select count(*)::int as total from occurrence_conversation_audio_transcriptions where company_id = ${company.companyId}::uuid`,
    )
    expect((own as unknown as readonly { total: number }[])[0]?.total).toBe(1)
    expect(second.created).toBe(0)
  })

  test('sem backfill: áudio anterior ao marco da empresa nunca é criado', async () => {
    const company = await seedCompany()
    const before = await seedAudio(company, { ageHours: 1 })
    await queue.materializeMarker()
    await db.execute(sql`
      update company_audio_transcription_settings
      set enabled_since = now(), routine_started_at = now()
      where company_id = ${company.companyId}::uuid
    `)
    await queue.discoverPending({ recoveryWindowHours: 72 })
    expect(await transcription(before.attachmentId)).toBeUndefined()

    const after = await seedAudio(company)
    await queue.discoverPending({ recoveryWindowHours: 72 })
    expect((await transcription(after.attachmentId))?.status).toBe('pending')
  })

  test('marco: PUT antes da rotina (routine_started_at nulo) é preenchido no primeiro ciclo', async () => {
    const company = await seedCompany()
    await db.execute(sql`
      insert into company_audio_transcription_settings (company_id, enabled) values (${company.companyId}::uuid, true)
      on conflict (company_id) do update set routine_started_at = null
    `)
    await queue.materializeMarker()
    const [row] = (await db.execute(sql`
      select routine_started_at from company_audio_transcription_settings where company_id = ${company.companyId}::uuid
    `)) as unknown as readonly { routine_started_at: unknown }[]
    expect(row?.routine_started_at).not.toBeNull()
  })

  test('reivindicação concorrente: SKIP LOCKED entrega cada linha a uma execução só, com attempts + 1', async () => {
    const company = await seedCompany()
    const audios = await Promise.all(Array.from({ length: 5 }, () => insertPending(company)))
    const ownIds = new Set(audios.map((audio) => audio.attachmentId))

    const claims = await Promise.all(
      Array.from({ length: 8 }, () => queue.claimNext({ leaseMs: LEASE_MS })),
    )
    const mine = claims.filter(
      (claimed) => claimed !== undefined && ownIds.has(claimed.attachmentId),
    )

    expect(mine).toHaveLength(5)
    expect(new Set(mine.map((claimed) => claimed?.id)).size).toBe(5)
    expect(new Set(mine.map((claimed) => claimed?.leaseToken)).size).toBe(5)
    expect(mine.every((claimed) => claimed?.attempts === 1)).toBe(true)
    expect((await transcription(audios[0]?.attachmentId ?? ''))?.attempts).toBe(1)
  })

  test('a reivindicação filtra attempts < 3 e respeita o lease vivo; lease vencido volta à fila', async () => {
    const company = await seedCompany()
    const exhausted = await insertPending(company, { attempts: 3 })
    const expiredLease = await insertPending(company, { attempts: 1, leaseExpiredAgoMinutes: 5 })

    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(claimed?.attachmentId).toBe(expiredLease.attachmentId)
    expect(claimed?.attempts).toBe(2)
    expect((await transcription(exhausted.attachmentId))?.attempts).toBe(3)

    const again = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(again?.attachmentId).not.toBe(expiredLease.attachmentId)
    expect(again?.attachmentId).not.toBe(exhausted.attachmentId)
  })

  test('varredura: attempts >= 3 com lease vencido (processo morto) fecha attempts_exhausted; lease vivo fica', async () => {
    const company = await seedCompany()
    const dead = await insertPending(company, { attempts: 3, leaseExpiredAgoMinutes: 1 })
    const alive = await insertPending(company, { attempts: 3 })
    await db.execute(sql`
      update occurrence_conversation_audio_transcriptions
      set lease_token = gen_random_uuid(), lease_expires_at = now() + interval '10 minutes'
      where attachment_id = ${alive.attachmentId}::uuid
    `)

    const swept = await queue.sweepExhausted()
    expect(swept).toBeGreaterThanOrEqual(1)
    const deadRow = await transcription(dead.attachmentId)
    expect(deadRow?.status).toBe('failed')
    expect(deadRow?.failure_code).toBe('attempts_exhausted')
    expect(deadRow?.lease_token).toBeNull()
    expect((await transcription(alive.attachmentId))?.status).toBe('pending')
  })

  test('toda escrita exige o lease_token: quem perdeu a posse grava zero linhas', async () => {
    const company = await seedCompany()
    const audio = await insertPending(company)
    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(claimed?.attachmentId).toBe(audio.attachmentId)
    const stale = { id: claimed?.id ?? '', leaseToken: crypto.randomUUID() }
    const mine = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }

    const ready = {
      durationMs: 5_000,
      engine: 'whisper.cpp',
      language: 'pt',
      model: 'small-q5_1',
      processingMs: 800,
      text: 'ola',
    }
    expect(await queue.writeReady({ ...stale, ...ready })).toBe(false)
    expect(await queue.writeFailed({ ...stale, failureCode: 'engine_failed' })).toBe(false)
    expect(await queue.scheduleRetry({ ...stale, backoffMinutes: 1 })).toBe(false)
    expect(await queue.writePurged(stale)).toBe(false)
    expect(await queue.release(stale)).toBe(false)
    expect((await transcription(audio.attachmentId))?.status).toBe('pending')

    const before = (await transcription(audio.attachmentId))?.updated_at as Date
    expect(await queue.writeReady({ ...mine, ...ready })).toBe(true)
    const after = await transcription(audio.attachmentId)
    expect(after?.status).toBe('ready')
    expect(after?.text).toBe('ola')
    expect(after?.lease_token).toBeNull()
    expect(new Date(after?.updated_at as Date).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    )
    expect(await queue.writeReady({ ...mine, ...ready })).toBe(false)
  })

  test('too_long grava o teto e a duração; sem too_long o CHECK exige teto nulo', async () => {
    const company = await seedCompany()
    const audio = await insertPending(company)
    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    const lease = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }
    expect(
      await queue.writeFailed({
        ...lease,
        durationMs: 601_000,
        failureCode: 'too_long',
        maxDurationMs: 600_000,
      }),
    ).toBe(true)
    const row = await transcription(audio.attachmentId)
    expect(row?.failure_code).toBe('too_long')
    expect(row?.max_duration_ms).toBe(600_000)
    expect(row?.audio_duration_ms).toBe(601_000)
  })

  test('soltura graciosa devolve a tentativa; retry agenda o backoff e libera o lease', async () => {
    const company = await seedCompany()
    const audio = await insertPending(company)
    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    const lease = { id: claimed?.id ?? '', leaseToken: claimed?.leaseToken ?? '' }
    expect(await queue.release(lease)).toBe(true)
    const released = await transcription(audio.attachmentId)
    expect(released?.attempts).toBe(0)
    expect(released?.lease_token).toBeNull()

    const again = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(again?.attachmentId).toBe(audio.attachmentId)
    const lease2 = { id: again?.id ?? '', leaseToken: again?.leaseToken ?? '' }
    expect(await queue.scheduleRetry({ ...lease2, backoffMinutes: 5 })).toBe(true)
    const row = await transcription(audio.attachmentId)
    expect(row?.status).toBe('pending')
    expect(row?.attempts).toBe(1)
    expect(new Date(row?.next_attempt_at as Date).getTime()).toBeGreaterThan(
      Date.now() + 4 * 60_000,
    )
    const none = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(none?.attachmentId).not.toBe(audio.attachmentId)
  })

  test('expurgo: ready cujo objeto foi apagado perde o texto e vira purged', async () => {
    const company = await seedCompany()
    const audio = await insertPending(company)
    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    await queue.writeReady({
      durationMs: 1_000,
      engine: 'whisper.cpp',
      id: claimed?.id ?? '',
      language: 'pt',
      leaseToken: claimed?.leaseToken ?? '',
      model: null,
      processingMs: 10,
      text: 'segredo',
    })
    await db.execute(
      sql`update stored_objects set status = 'deleted', deleted_at = now() where id = ${audio.storedObjectId}::uuid`,
    )
    expect(await queue.purgeDeletedObjects()).toBeGreaterThanOrEqual(1)
    const row = await transcription(audio.attachmentId)
    expect(row?.status).toBe('purged')
    expect(row?.text).toBeNull()
  })

  test('claimNext avisa que o objeto foi apagado e devolve os dados do anexo pela linha', async () => {
    const company = await seedCompany()
    const audio = await insertPending(company)
    await db.execute(
      sql`update stored_objects set status = 'deleted', deleted_at = now() where id = ${audio.storedObjectId}::uuid`,
    )
    const claimed = await queue.claimNext({ leaseMs: LEASE_MS })
    expect(claimed?.attachmentId).toBe(audio.attachmentId)
    expect(claimed?.objectDeleted).toBe(true)
    expect(claimed?.contentType).toBe('audio/ogg')
    expect(claimed?.conversationId).toBe(company.conversationId)
  })

  test('isCompanyEnabled: sem linha é ligada; desligada é falsa', async () => {
    const company = await seedCompany()
    expect(await queue.isCompanyEnabled(crypto.randomUUID())).toBe(true)
    await queue.materializeMarker()
    expect(await queue.isCompanyEnabled(company.companyId)).toBe(true)
    await db.execute(
      sql`update company_audio_transcription_settings set enabled = false where company_id = ${company.companyId}::uuid`,
    )
    expect(await queue.isCompanyEnabled(company.companyId)).toBe(false)
  })
})
