/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A devolução por vencimento contra Postgres de verdade: só o chat do atendente com o prazo vencido volta ao bot, e a
 * linha fica como a `expireDue` da API a deixa.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'
import { createWhatsAppInboxExpireRoutine } from '../src/whatsapp-inbox-expire/application/whatsapp-inbox-expire.routine.js'
import { createDrizzleExpireDueWhatsAppChats } from '../src/whatsapp-inbox-expire/infrastructure/drizzle-whatsapp-inbox-expire.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'whatsapp-inbox-expire-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'whatsapp-inbox.chat.expire',
  origin: 'schedule',
}

describeDatabase('devolução das conversas vencidas do WhatsApp (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertChat(input: {
    readonly expiresInMinutes: number | null
    readonly jid: string
    readonly state: 'bot' | 'operator'
  }) {
    await db.execute(sql`
      insert into whatsapp_chats
        (company_id, chat_jid, kind, state, taken_over_by_user_id, taken_over_at, expires_at)
      values (
        ${companyId}, ${input.jid}, 'direct', ${input.state},
        ${input.state === 'operator' ? userId : null},
        ${input.state === 'operator' ? sql`now() - interval '1 hour'` : null},
        ${input.expiresInMinutes === null ? null : sql`now() + make_interval(mins => ${input.expiresInMinutes}::integer)`}
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (company_id, user_id, status) values (${companyId}, ${userId}, 'active')`,
    )
    await insertChat({
      expiresInMinutes: -5,
      jid: '5516990000001@s.whatsapp.net',
      state: 'operator',
    })
    await insertChat({
      expiresInMinutes: 20,
      jid: '5516990000002@s.whatsapp.net',
      state: 'operator',
    })
    await insertChat({ expiresInMinutes: null, jid: '5516990000003@s.whatsapp.net', state: 'bot' })
  })

  afterAll(async () => {
    await db.execute(sql`delete from whatsapp_chats where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  function buildRoutine() {
    return createWhatsAppInboxExpireRoutine({
      expire: createDrizzleExpireDueWhatsAppChats(db),
      logger: SILENT_LOGGER as never,
      now: () => new Date(),
    })
  }

  test('devolve só o vencido, deixa o prazo corrente e o chat do bot como estavam', async () => {
    const result = await buildRoutine().run(CONTEXT)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters.released).toBeGreaterThanOrEqual(1)

    const rows = await db.execute(sql`
      select chat_jid, state, taken_over_by_user_id, expires_at, release_reason, released_at, released_by_user_id
      from whatsapp_chats where company_id = ${companyId} order by chat_jid
    `)
    const [expired, running, idle] = rows
    expect(expired).toMatchObject({
      expires_at: null,
      release_reason: 'expired',
      released_by_user_id: null,
      state: 'bot',
      taken_over_by_user_id: null,
    })
    expect(expired?.released_at).not.toBeNull()
    expect(running).toMatchObject({
      release_reason: null,
      state: 'operator',
      taken_over_by_user_id: userId,
    })
    expect(idle).toMatchObject({ release_reason: null, state: 'bot' })
  })

  test('o segundo ciclo não encontra mais nada desta empresa para devolver', async () => {
    await buildRoutine().run(CONTEXT)
    const rows = await db.execute(sql`
      select count(*)::int as total from whatsapp_chats
      where company_id = ${companyId} and release_reason = 'expired'
    `)
    expect(Number(rows[0]?.total)).toBe(1)
  })
})
