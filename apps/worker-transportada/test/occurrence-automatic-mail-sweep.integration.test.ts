/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b (RF2), contra Postgres real: a fila do varredor — o que entra (maduro, dentro da
 * janela, tipo que avisa, contratante casada, ainda sem aviso) e o que fica de fora, e a garantia de
 * que duas passadas viram um envio só.
 *
 * Spec 271: entra só a ocorrência cujo tipo escolheu, pela chave, um modelo utilizável no módulo de notificação
 * (versão ativa mais alta, e-mail `pt-BR`, assunto preenchido, corpo sem HTML) — sem ele a API pula e o varredor a
 * revisitaria a cada batida até a janela fechar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { nfeDocuments, storedObjects } from '../src/database/nfe.schema.js'
import { createOccurrenceAutomaticMailSweepRoutine } from '../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-sweep.routine.js'
import {
  OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX,
  OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION,
  OCCURRENCE_AUTOMATIC_MAIL_SWEEP_JOB,
} from '../src/occurrence-automatic-mail-sweep/domain/occurrence-automatic-mail-sweep.constant.js'
import { createDrizzleOccurrenceAutomaticMailQueue } from '../src/occurrence-automatic-mail-sweep/infrastructure/drizzle-occurrence-automatic-mail-queue.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-10-09T12:00:00.000Z')
const SHA256 = 'd'.repeat(64)
const MINUTE = 60_000

type TemplateShape =
  | 'emptySubject'
  | 'html'
  | 'inactive'
  | 'none'
  | 'newerVersionHtml'
  | 'otherChannel'
  | 'otherCompanyOnly'
  | 'otherLocale'
  | 'usable'

type Scenario = {
  readonly ageMilliseconds: number
  readonly alreadySent?: boolean
  readonly cancelled?: boolean
  readonly hasContractor?: boolean
  /** Spec 271: o que o módulo de notificação tem para a chave escolhida no tipo; padrão `usable`. */
  readonly template?: TemplateShape
  readonly typeEmailsContractor?: boolean
  /** Spec 271: padrão `true`; `false` é o tipo sem modelo escolhido (chave nula). */
  readonly typeHasKey?: boolean
  /** Spec 271: quando a chave foi escolhida no tipo, em relação à ocorrência; padrão antes (`-MINUTE`). */
  readonly typeSelectedOffsetMilliseconds?: number
}

const SCENARIOS = {
  alreadySent: { ageMilliseconds: 30 * MINUTE, alreadySent: true },
  cancelled: { ageMilliseconds: 30 * MINUTE, cancelled: true },
  fresh: { ageMilliseconds: 2 * MINUTE },
  noContractor: { ageMilliseconds: 30 * MINUTE, hasContractor: false },
  noKey: { ageMilliseconds: 30 * MINUTE, typeHasKey: false },
  older: { ageMilliseconds: 45 * MINUTE },
  ripe: { ageMilliseconds: 30 * MINUTE },
  templateEmptySubject: { ageMilliseconds: 30 * MINUTE, template: 'emptySubject' },
  templateHtml: { ageMilliseconds: 30 * MINUTE, template: 'html' },
  templateInactive: { ageMilliseconds: 30 * MINUTE, template: 'inactive' },
  templateMissing: { ageMilliseconds: 30 * MINUTE, template: 'none' },
  templateNewerVersionHtml: { ageMilliseconds: 30 * MINUTE, template: 'newerVersionHtml' },
  templateOfAnotherCompany: { ageMilliseconds: 30 * MINUTE, template: 'otherCompanyOnly' },
  templateOtherChannel: { ageMilliseconds: 30 * MINUTE, template: 'otherChannel' },
  templateOtherLocale: { ageMilliseconds: 30 * MINUTE, template: 'otherLocale' },
  tooOld: { ageMilliseconds: OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS + 60 * MINUTE },
  typeOff: { ageMilliseconds: 30 * MINUTE, typeEmailsContractor: false },
  typeSelectedLater: { ageMilliseconds: 30 * MINUTE, typeSelectedOffsetMilliseconds: MINUTE },
} as const satisfies Record<string, Scenario>
type ScenarioName = keyof typeof SCENARIOS

const USABLE_BODY = 'Ocorrência na nota {{numeroNota}}'

describeDatabase('a fila do varredor de e-mail automático (integration)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const occurrenceIds = {} as Record<ScenarioName | 'otherCompany', string>
  const ownIds = new Set<string>()
  let accessKeySequence = 0

  const queue = createDrizzleOccurrenceAutomaticMailQueue(db)
  const window = {
    createdAfter: new Date(NOW.getTime() - OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS),
    createdBefore: new Date(NOW.getTime() - OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS),
  }

  async function listOwn(limit = 100, excludeOccurrenceIds: readonly string[] = []) {
    const pending = await queue.listPending({ ...window, excludeOccurrenceIds, limit })
    return pending.filter((item) => ownIds.has(item.occurrenceId))
  }

  async function seedCompany(id: string): Promise<void> {
    await db.execute(sql`insert into companies (id, status) values (${id}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${id}, 'active')`,
    )
    await db.execute(
      sql`insert into nfe_imports (id, company_id, correlation_id, idempotency_key, request_fingerprint,
            requested_by_user_id, source, status, received_count)
          values (${crypto.randomUUID()}, ${id}, 'sweep-correlation', ${`idem-${id}`},
            ${`fingerprint-${id}`}, ${userId}, 'upload', 'completed', 1)`,
    )
  }

  async function seedOccurrence(input: {
    readonly company: string
    readonly scenario: Scenario
    readonly taxId: string
  }): Promise<string> {
    const { company, scenario, taxId } = input
    const [importRow] = (await db.execute(
      sql`select id from nfe_imports where company_id = ${company} limit 1`,
    )) as unknown as { id: string }[]
    const objectId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const tripDocumentId = crypto.randomUUID()
    const typeId = crypto.randomUUID()
    const occurrenceId = crypto.randomUUID()
    accessKeySequence += 1

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
      accessKey: `${'3519'.padEnd(32, '0')}${String(accessKeySequence).padStart(12, '0')}`,
      authorizationProtocol: '135260000000001',
      companyId: company,
      createdByUserId: userId,
      id: documentId,
      importId: importRow?.id ?? '',
      issuedAt: new Date('2026-10-01T12:00:00.000Z'),
      model: '55',
      number: String(accessKeySequence),
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
    await db.execute(
      sql`insert into nfe_participants (id, company_id, document_id, role, tax_id)
          values (${crypto.randomUUID()}, ${company}, ${documentId}, 'emitter', ${taxId})`,
    )
    await db.execute(sql`insert into trips (id, company_id) values (${tripId}, ${company})`)
    await db.execute(
      sql`insert into trip_documents (id, company_id, trip_id, nfe_document_id)
          values (${tripDocumentId}, ${company}, ${tripId}, ${documentId})`,
    )
    const createdAt = new Date(NOW.getTime() - scenario.ageMilliseconds)
    const typeSelectedAt = new Date(
      createdAt.getTime() + (scenario.typeSelectedOffsetMilliseconds ?? -MINUTE),
    )
    const hasKey = scenario.typeHasKey !== false
    const key = `ocorrencia.${typeId}`
    await db.execute(
      sql`insert into company_occurrence_types
            (id, company_id, name, stage, emails_contractor, contractor_notification_template_key,
             contractor_notification_template_selected_at)
          values (${typeId}, ${company}, ${`Prorrogação ${typeId}`}, 'delivery',
            ${scenario.typeEmailsContractor ?? true},
            ${hasKey ? key : null},
            ${hasKey ? typeSelectedAt.toISOString() : null}::timestamptz)`,
    )
    if (hasKey) await seedTemplates({ company, key, shape: scenario.template ?? 'usable' })
    await db.execute(
      sql`insert into trip_document_occurrences
            (id, company_id, trip_document_id, stage, actor_user_id, occurrence_type_id, created_at,
             cancelled_at, cancelled_by_user_id, cancellation_reason)
          values (${occurrenceId}, ${company}, ${tripDocumentId}, 'delivery', ${userId}, ${typeId},
            ${createdAt.toISOString()}::timestamptz,
            ${scenario.cancelled === true ? createdAt.toISOString() : null}::timestamptz,
            ${scenario.cancelled === true ? userId : null}::uuid,
            ${scenario.cancelled === true ? 'lançada por engano' : null})`,
    )
    if (scenario.alreadySent === true) await recordSend(company, occurrenceId)
    ownIds.add(occurrenceId)
    return occurrenceId
  }

  async function insertTemplate(input: {
    readonly active?: boolean
    readonly body?: string
    readonly channel?: string
    readonly company: string
    readonly key: string
    readonly locale?: string
    readonly subject?: string
    readonly version?: number
  }): Promise<void> {
    await db.execute(
      sql`insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
          values (${input.company}, ${input.key}, ${input.channel ?? 'email'}, ${input.locale ?? 'pt-BR'},
            ${input.version ?? 1}, ${input.subject ?? 'Ocorrência'}, ${input.body ?? USABLE_BODY},
            ${input.active ?? true})`,
    )
  }

  async function seedTemplates(input: {
    readonly company: string
    readonly key: string
    readonly shape: TemplateShape
  }): Promise<void> {
    const { company, key, shape } = input
    if (shape === 'none') return
    if (shape === 'otherCompanyOnly') {
      await insertTemplate({ company: otherCompanyId, key })
      return
    }
    await insertTemplate({
      company,
      key,
      ...(shape === 'emptySubject' ? { subject: '   ' } : {}),
      ...(shape === 'html' ? { body: '<p>Olá {{contratante}}</p>' } : {}),
      ...(shape === 'inactive' ? { active: false } : {}),
      ...(shape === 'otherChannel' ? { channel: 'inbox' } : {}),
      ...(shape === 'otherLocale' ? { locale: 'en-US' } : {}),
    })
    if (shape === 'newerVersionHtml') {
      await insertTemplate({ body: '<b>nova</b>', company, key, version: 2 })
    }
  }

  async function recordSend(company: string, occurrenceId: string): Promise<void> {
    await db.execute(
      sql`insert into idempotency_records (company_id, operation, idempotency_key, request_fingerprint, status, response)
          values (${company}, ${OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION},
            ${`${OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX}${occurrenceId}`}, 'fingerprint', 'completed', '{}'::jsonb)
          on conflict do nothing`,
    )
  }

  beforeAll(async () => {
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await seedCompany(companyId)
    await seedCompany(otherCompanyId)
    const contractorTaxId = '11222333000181'
    await db.execute(
      sql`insert into contractors (id, company_id, tax_id, display_name)
          values (${crypto.randomUUID()}, ${companyId}, ${contractorTaxId}, 'Contratante Alfa')`,
    )
    await db.execute(
      sql`insert into contractors (id, company_id, tax_id, display_name)
          values (${crypto.randomUUID()}, ${otherCompanyId}, ${contractorTaxId}, 'Contratante Alfa')`,
    )
    for (const name of Object.keys(SCENARIOS) as ScenarioName[]) {
      const scenario: Scenario = SCENARIOS[name]
      occurrenceIds[name] = await seedOccurrence({
        company: companyId,
        scenario,
        taxId: scenario.hasContractor === false ? '99888777000166' : contractorTaxId,
      })
    }
    occurrenceIds.otherCompany = await seedOccurrence({
      company: otherCompanyId,
      scenario: { ageMilliseconds: 20 * MINUTE },
      taxId: contractorTaxId,
    })
  })

  afterAll(async () => {
    for (const id of [companyId, otherCompanyId]) {
      await db.execute(sql`delete from idempotency_records where company_id = ${id}`)
      await db.execute(sql`delete from trip_document_occurrences where company_id = ${id}`)
      await db.execute(sql`delete from company_occurrence_types where company_id = ${id}`)
      await db.execute(sql`delete from notification.templates where company_id = ${id}`)
      await db.execute(sql`delete from trip_documents where company_id = ${id}`)
      await db.execute(sql`delete from trips where company_id = ${id}`)
      await db.execute(sql`delete from nfe_participants where company_id = ${id}`)
      await db.execute(sql`delete from contractors where company_id = ${id}`)
      await db.execute(sql`delete from nfe_documents where company_id = ${id}`)
      await db.execute(sql`delete from stored_objects where company_id = ${id}`)
      await db.execute(sql`delete from nfe_imports where company_id = ${id}`)
      await db.execute(sql`delete from user_company_memberships where company_id = ${id}`)
      await db.execute(sql`delete from companies where id = ${id}`)
    }
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await provider.close()
  })

  it('lists only the ripe, in-window, still-unsent occurrences of types that mail the contractor', async () => {
    const pending = await listOwn()

    expect(pending.map((item) => item.occurrenceId).sort()).toEqual(
      [occurrenceIds.older, occurrenceIds.otherCompany, occurrenceIds.ripe].sort(),
    )
  })

  it('leaves out a type with no key, and a key with no usable template in the notification module (spec 271)', async () => {
    const listed = (await listOwn()).map((item) => item.occurrenceId)

    for (const name of [
      'noKey',
      'templateEmptySubject',
      'templateHtml',
      'templateInactive',
      'templateMissing',
      'templateNewerVersionHtml',
      'templateOfAnotherCompany',
      'templateOtherChannel',
      'templateOtherLocale',
    ] as const) {
      expect(listed).not.toContain(occurrenceIds[name])
    }
    expect(listed).toContain(occurrenceIds.ripe)
  })

  it('skips what was registered before the template was chosen on the type (spec 269, kept)', async () => {
    const listed = (await listOwn()).map((item) => item.occurrenceId)

    expect(listed).not.toContain(occurrenceIds.typeSelectedLater)
    expect(listed).toContain(occurrenceIds.ripe)
  })

  it('returns the company of each occurrence and the oldest first', async () => {
    const pending = await listOwn()

    expect(pending[0]).toEqual({ companyId, occurrenceId: occurrenceIds.older })
    expect(
      pending.find((item) => item.occurrenceId === occurrenceIds.otherCompany)?.companyId,
    ).toBe(otherCompanyId)
  })

  it('honors the limit and the exclusion of ids already seen in the cycle', async () => {
    const first = await queue.listPending({ ...window, excludeOccurrenceIds: [], limit: 1 })
    const rest = await listOwn(
      100,
      first.map((item) => item.occurrenceId),
    )

    expect(first).toHaveLength(1)
    expect(rest.map((item) => item.occurrenceId)).not.toContain(first[0]?.occurrenceId)
  })

  it('two sweeps send once: the second finds the idempotency record the first left behind', async () => {
    const sent: string[] = []
    const routine = createOccurrenceAutomaticMailSweepRoutine({
      errorTracker: { captureException: () => undefined },
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      mailApi: {
        async send({ companyId: sentCompanyId, occurrenceId }) {
          if (ownIds.has(occurrenceId)) sent.push(occurrenceId)
          await recordSend(sentCompanyId, occurrenceId)
          return { outcome: 'sent' }
        },
      },
      now: () => NOW,
      queue,
    })
    const context = {
      correlationId: 'correlation-1',
      executionId: 'execution-1',
      isStopRequested: () => false,
      job: OCCURRENCE_AUTOMATIC_MAIL_SWEEP_JOB,
      origin: 'schedule',
    } as const

    await routine.run(context)
    await routine.run(context)

    expect(sent.sort()).toEqual(
      [occurrenceIds.older, occurrenceIds.otherCompany, occurrenceIds.ripe].sort(),
    )
    expect(await listOwn()).toEqual([])
  })
})
