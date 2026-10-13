/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.10 (RF5, CA05), contra Postgres real: a fila do alarme (o que entra e o que fica de fora), a
 * transição por `alert_count` (primeiro alerta vira `overdue`, um por intervalo, teto, duas execuções não
 * duplicam), o evento gravado, o destinatário (quem despachou a viagem) e o isolamento por empresa.
 *
 * ⚠️ O histórico do retorno é append-only por trigger: as linhas deste teste ficam no banco, com ids novos
 * a cada execução, e a leitura delas é sempre pelos ids semeados aqui.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { nfeDocuments, storedObjects } from '../src/database/nfe.schema.js'
import type { NotifyContractorReplyAlertParams } from '../src/occurrence-contractor-reply-alert/application/occurrence-contractor-reply-alert.port.js'
import { createOccurrenceContractorReplyAlertRoutine } from '../src/occurrence-contractor-reply-alert/application/occurrence-contractor-reply-alert.routine.js'
import { OCCURRENCE_CONTRACTOR_REPLY_ALERT_JOB } from '../src/occurrence-contractor-reply-alert/domain/occurrence-contractor-reply-alert.constant.js'
import { createDrizzleOccurrenceContractorReplyAlertQueue } from '../src/occurrence-contractor-reply-alert/infrastructure/drizzle-occurrence-contractor-reply-alert-queue.repository.js'
import { createDrizzleOccurrenceContractorReplyAlertStore } from '../src/occurrence-contractor-reply-alert/infrastructure/drizzle-occurrence-contractor-reply-alert-store.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-10-12T12:00:00.000Z')
const SHA256 = 'c'.repeat(64)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

type ReplyScenario = {
  readonly alertCount?: number
  readonly alertMaxCount?: number
  readonly alertMode?: 'alert_operator' | 'off'
  readonly dispatched?: boolean
  readonly deadlineOffsetMilliseconds: number | null
  readonly intervalMinutes?: number
  readonly lastAlertOffsetMilliseconds?: number
  readonly otherCompany?: boolean
  readonly pendingWindow?: boolean
  readonly status: 'awaiting_contractor' | 'handled' | 'overdue' | 'reply_received'
}

describeDatabase('o alarme do retorno vencido da contratante (integration)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const dispatcherUserId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const replyIds = new Map<string, string>()
  const occurrenceIds = new Map<string, string>()
  const scaffolds = new Map<string, { tripDocumentId: string; typeId: string }>()
  let sequence = 0

  const queue = createDrizzleOccurrenceContractorReplyAlertQueue(db)
  const store = createDrizzleOccurrenceContractorReplyAlertStore(db)

  async function listOwn(at: Date = NOW): Promise<readonly string[]> {
    const own = new Set(replyIds.values())
    const due = await queue.listDue({ excludeReplyIds: [], limit: 200, now: at })
    return due.filter((item) => own.has(item.replyId)).map((item) => item.replyId)
  }

  function nameOf(replyId: string): string {
    return [...replyIds.entries()].find(([, id]) => id === replyId)?.[0] ?? replyId
  }

  async function seedCompany(id: string): Promise<void> {
    await db.execute(sql`insert into companies (id, status) values (${id}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${id}, 'active')`,
    )
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${dispatcherUserId}, ${id}, 'active')`,
    )
    await db.execute(
      sql`insert into nfe_imports (id, company_id, correlation_id, idempotency_key, request_fingerprint,
            requested_by_user_id, source, status, received_count)
          values (${crypto.randomUUID()}, ${id}, 'alert-correlation', ${`idem-${id}`},
            ${`fingerprint-${id}`}, ${userId}, 'upload', 'completed', 1)`,
    )
  }

  async function seedScaffold(input: {
    readonly company: string
    readonly dispatched: boolean
  }): Promise<{ tripDocumentId: string; typeId: string }> {
    const { company } = input
    const [importRow] = (await db.execute(
      sql`select id from nfe_imports where company_id = ${company} limit 1`,
    )) as unknown as { id: string }[]
    const objectId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const tripDocumentId = crypto.randomUUID()
    const typeId = crypto.randomUUID()
    sequence += 1

    await db.insert(storedObjects).values({
      bucket: 'transportada-private',
      companyId: company,
      id: objectId,
      mimeType: 'application/xml',
      objectKey: `tenants/${company}/${objectId}`,
      provider: 'minio',
      purpose: 'nfe_document',
      sha256: SHA256,
      sizeBytes: 128n,
      status: 'final',
    })
    await db.insert(nfeDocuments).values({
      accessKey: `${'3520'.padEnd(32, '0')}${String(sequence).padStart(12, '0')}`,
      authorizationProtocol: '135260000000002',
      companyId: company,
      createdByUserId: userId,
      id: documentId,
      importId: importRow?.id ?? '',
      issuedAt: new Date('2026-10-01T12:00:00.000Z'),
      model: '55',
      number: `${900 + sequence}`,
      operationNature: 'Venda',
      operationType: '0',
      productsValue: '10.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '10.0000',
      xmlObjectId: objectId,
      xmlSha256: SHA256,
    })
    await db.execute(sql`insert into trips (id, company_id) values (${tripId}, ${company})`)
    await db.execute(
      sql`insert into trip_documents (id, company_id, trip_id, nfe_document_id)
          values (${tripDocumentId}, ${company}, ${tripId}, ${documentId})`,
    )
    await db.execute(
      sql`insert into company_occurrence_types (id, company_id, name, stage, emails_contractor)
          values (${typeId}, ${company}, ${`Prorrogação ${typeId}`}, 'delivery', true)`,
    )
    if (input.dispatched) {
      await db.execute(
        sql`insert into trip_dispatch_snapshots (id, company_id, trip_id, snapshot, snapshot_sha256, actor_user_id)
            values (${crypto.randomUUID()}, ${company}, ${tripId}, '{}'::jsonb, ${SHA256}, ${dispatcherUserId})`,
      )
    }
    return { tripDocumentId, typeId }
  }

  async function seedPendingWindow(input: {
    readonly company: string
    readonly conversationId: string
    readonly replyId: string
  }): Promise<void> {
    const { company, conversationId, replyId } = input
    const objectId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const attachmentId = crypto.randomUUID()
    await db.execute(
      sql`insert into stored_objects (id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose)
          values (${objectId}, ${company}, 'minio', 'transportada-private', ${`tenants/${company}/${objectId}`},
            'application/pdf', 128, ${SHA256}, 'final', 'delivery_proof')`,
    )
    await db.execute(
      sql`insert into occurrence_conversation_messages (id, company_id, conversation_id, channel, direction, author_user_id, status)
          values (${messageId}, ${company}, ${conversationId}, 'app', 'outbound', ${userId}, 'sent')`,
    )
    await db.execute(
      sql`insert into occurrence_conversation_attachments (id, company_id, message_id, stored_object_id, sha256, size_bytes, content_type)
          values (${attachmentId}, ${company}, ${messageId}, ${objectId}, ${SHA256}, 128, 'application/pdf')`,
    )
    await db.execute(
      sql`insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, attachment_id, idempotency_key, created_at)
          values (${company}, ${replyId}, 'driver_whatsapp', 'automatic', 'pending_window', ${attachmentId},
            ${`pending-${replyId}`}, ${new Date(NOW.getTime() - HOUR).toISOString()}::timestamptz)`,
    )
  }

  async function seedReply(name: string, scenario: ReplyScenario): Promise<void> {
    const company = scenario.otherCompany === true ? otherCompanyId : companyId
    const scaffoldKey = `${company}:${scenario.dispatched === false ? 'plain' : 'dispatched'}`
    const scaffold =
      scaffolds.get(scaffoldKey) ??
      (await seedScaffold({ company, dispatched: scenario.dispatched !== false }))
    scaffolds.set(scaffoldKey, scaffold)

    const occurrenceId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const replyId = crypto.randomUUID()
    await db.execute(
      sql`insert into trip_document_occurrences (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id)
          values (${occurrenceId}, ${company}, ${scaffold.tripDocumentId}, 'delivery', ${scaffold.typeId}, ${userId})`,
    )
    await db.execute(
      sql`insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
          values (${conversationId}, ${company}, 'document', ${occurrenceId}, 'driver', ${userId})`,
    )
    const config = JSON.stringify({
      alertIntervalMinutes: scenario.intervalMinutes ?? 60,
      alertMaxCount: scenario.alertMaxCount ?? 3,
      alertMode: scenario.alertMode ?? 'alert_operator',
      version: 1,
    })
    const deadline =
      scenario.deadlineOffsetMilliseconds === null
        ? null
        : new Date(NOW.getTime() + scenario.deadlineOffsetMilliseconds).toISOString()
    const lastAlert =
      scenario.lastAlertOffsetMilliseconds === undefined
        ? null
        : new Date(NOW.getTime() + scenario.lastAlertOffsetMilliseconds).toISOString()
    const isHandled = scenario.status === 'handled'
    await db.execute(
      sql`insert into occurrence_contractor_replies
            (id, company_id, occurrence_id, conversation_id, config, status, deadline_at, alert_count, last_alert_at,
             handled_by_user_id, handled_note)
          values (${replyId}, ${company}, ${occurrenceId}, ${conversationId}, ${config}::text::jsonb, ${scenario.status},
            ${deadline}::timestamptz, ${scenario.alertCount ?? 0}, ${lastAlert}::timestamptz,
            ${isHandled ? userId : null}::uuid, ${isHandled ? 'tratado' : null})`,
    )
    if (scenario.pendingWindow === true) {
      await seedPendingWindow({ company, conversationId, replyId })
    }
    replyIds.set(name, replyId)
    occurrenceIds.set(name, occurrenceId)
  }

  function readReply(name: string) {
    return db
      .execute(
        sql`select status, alert_count, last_alert_at from occurrence_contractor_replies where id = ${replyIds.get(name)}::uuid`,
      )
      .then((rows) => (rows as unknown as { alert_count: number; status: string }[])[0])
  }

  async function countEvents(name: string): Promise<number> {
    const rows = (await db.execute(
      sql`select count(*)::int as total from occurrence_contractor_reply_events where reply_id = ${replyIds.get(name)}::uuid`,
    )) as unknown as { total: number }[]
    return rows[0]?.total ?? 0
  }

  function buildRoutine(notified: NotifyContractorReplyAlertParams[], at: Date = NOW) {
    return createOccurrenceContractorReplyAlertRoutine({
      errorTracker: { captureException: () => undefined },
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      notifier: {
        async notify(params) {
          if (replyIds.size > 0 && [...replyIds.values()].includes(params.replyId)) {
            notified.push(params)
          }
        },
      },
      now: () => at,
      queue,
      store,
    })
  }

  const context = {
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: OCCURRENCE_CONTRACTOR_REPLY_ALERT_JOB,
    origin: 'schedule',
  } as const

  beforeAll(async () => {
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into identity_users (id, status) values (${dispatcherUserId}, 'active')`,
    )
    await seedCompany(companyId)
    await seedCompany(otherCompanyId)
    await seedReply('overdueFirst', {
      deadlineOffsetMilliseconds: -2 * HOUR,
      status: 'awaiting_contractor',
    })
    await seedReply('beforeDeadline', {
      deadlineOffsetMilliseconds: HOUR,
      status: 'awaiting_contractor',
    })
    await seedReply('alertOff', {
      alertMode: 'off',
      deadlineOffsetMilliseconds: -2 * HOUR,
      status: 'awaiting_contractor',
    })
    await seedReply('capReached', {
      alertCount: 3,
      alertMaxCount: 3,
      deadlineOffsetMilliseconds: -10 * HOUR,
      lastAlertOffsetMilliseconds: -3 * HOUR,
      status: 'overdue',
    })
    await seedReply('intervalNotElapsed', {
      alertCount: 1,
      deadlineOffsetMilliseconds: -3 * HOUR,
      lastAlertOffsetMilliseconds: -30 * MINUTE,
      status: 'overdue',
    })
    await seedReply('intervalElapsed', {
      alertCount: 1,
      deadlineOffsetMilliseconds: -3 * HOUR,
      lastAlertOffsetMilliseconds: -61 * MINUTE,
      status: 'overdue',
    })
    await seedReply('handled', { deadlineOffsetMilliseconds: -5 * HOUR, status: 'handled' })
    await seedReply('pendingWindow', {
      deadlineOffsetMilliseconds: null,
      pendingWindow: true,
      status: 'reply_received',
    })
    await seedReply('withoutDispatch', {
      deadlineOffsetMilliseconds: -2 * HOUR,
      dispatched: false,
      status: 'awaiting_contractor',
    })
    await seedReply('otherCompany', {
      deadlineOffsetMilliseconds: -2 * HOUR,
      otherCompany: true,
      status: 'awaiting_contractor',
    })
  })

  afterAll(async () => {
    await provider.close()
  })

  it('lists only the replies that are due: past deadline, alarm on, under the cap, interval elapsed', async () => {
    const due = (await listOwn()).map(nameOf).toSorted()

    expect(due).toEqual(
      [
        'intervalElapsed',
        'otherCompany',
        'overdueFirst',
        'pendingWindow',
        'withoutDispatch',
      ].toSorted(),
    )
  })

  it('refuses to alert a reply through another company', async () => {
    const result = await store.applyAlert({
      companyId: otherCompanyId,
      now: NOW,
      replyId: replyIds.get('overdueFirst') ?? '',
    })

    expect(result).toEqual({ kind: 'skipped', reason: 'not_found' })
    expect((await readReply('overdueFirst'))?.alert_count).toBe(0)
  })

  it('the first alert makes the reply overdue, counts it, records the event and names who dispatched', async () => {
    const result = await store.applyAlert({
      companyId,
      now: NOW,
      replyId: replyIds.get('overdueFirst') ?? '',
    })

    expect(result).toEqual({
      alertNumber: 1,
      becomesOverdue: true,
      kind: 'alerted',
      recipient: {
        occurrenceLabel: `NF ${900 + 1}/1`,
        recipientUserId: dispatcherUserId,
      },
    })
    expect(await readReply('overdueFirst')).toMatchObject({ alert_count: 1, status: 'overdue' })
    expect(await countEvents('overdueFirst')).toBe(1)
  })

  it('two concurrent runs alert once: the loser finds the interval already served', async () => {
    const replyId = replyIds.get('intervalElapsed') ?? ''

    const results = await Promise.all([
      store.applyAlert({ companyId, now: NOW, replyId }),
      store.applyAlert({ companyId, now: NOW, replyId }),
    ])

    expect(results.filter((result) => result.kind === 'alerted')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'skipped')).toHaveLength(1)
    expect(await readReply('intervalElapsed')).toMatchObject({ alert_count: 2, status: 'overdue' })
    expect(await countEvents('intervalElapsed')).toBe(1)
  })

  it('a trip without dispatch is alerted and counted, but nobody is notified', async () => {
    const result = await store.applyAlert({
      companyId,
      now: NOW,
      replyId: replyIds.get('withoutDispatch') ?? '',
    })

    expect(result).toMatchObject({
      alertNumber: 1,
      becomesOverdue: true,
      kind: 'alerted',
      recipient: null,
    })
  })

  it('a reply waiting for the driver window alerts without becoming overdue', async () => {
    const result = await store.applyAlert({
      companyId,
      now: NOW,
      replyId: replyIds.get('pendingWindow') ?? '',
    })

    expect(result).toMatchObject({ alertNumber: 1, becomesOverdue: false, kind: 'alerted' })
    expect(await readReply('pendingWindow')).toMatchObject({
      alert_count: 1,
      status: 'reply_received',
    })
  })

  it('running the routine twice notifies each remaining alert once', async () => {
    const notified: NotifyContractorReplyAlertParams[] = []
    const routine = buildRoutine(notified)

    const first = await routine.run(context)
    const notifiedByFirstRun = notified.length
    const second = await routine.run(context)

    expect(first.outcome).toBe('succeeded')
    expect(second.outcome).toBe('succeeded')
    expect(notified).toHaveLength(notifiedByFirstRun)
    expect(notified.map((item) => nameOf(item.replyId)).toSorted()).toEqual(['otherCompany'])
    expect(notified[0]).toMatchObject({ alertNumber: 1, companyId: otherCompanyId })
    expect(await listOwn()).toEqual([])
  })

  it('alerts again after the interval and stops at the cap', async () => {
    const notified: NotifyContractorReplyAlertParams[] = []
    const replyId = replyIds.get('overdueFirst') ?? ''

    await buildRoutine(notified, new Date(NOW.getTime() + 61 * MINUTE)).run(context)
    await buildRoutine(notified, new Date(NOW.getTime() + 122 * MINUTE)).run(context)
    await buildRoutine(notified, new Date(NOW.getTime() + 300 * MINUTE)).run(context)

    const own = notified.filter((item) => item.replyId === replyId)
    expect(own.map((item) => item.alertNumber)).toEqual([2, 3])
    expect(await readReply('overdueFirst')).toMatchObject({ alert_count: 3, status: 'overdue' })
    expect(await countEvents('overdueFirst')).toBe(3)
  })
})
