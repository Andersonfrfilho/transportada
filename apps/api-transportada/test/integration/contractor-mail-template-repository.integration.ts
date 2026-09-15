/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: o isolamento dos modelos de e-mail e a troca de padrão só se provam contra um
 * Postgres de verdade — o único por nome e o único parcial de padrão são índices do banco, e a
 * troca atômica depende da transação serializar duas trocas concorrentes.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { DrizzleAddressCorrectionMailRepository } from '../../src/address-correction/infrastructure/drizzle-address-correction-mail.repository.js'
import {
  ContractorMailTemplateLimitReachedError,
  ContractorMailTemplateNameTakenError,
} from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
import { CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE } from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import { DrizzleContractorMailTemplateRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-template.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  violatedForeignKeyConstraint,
  violatedUniqueConstraint,
} from '../../src/database/postgres-error.support.js'

/** `db.execute` devolve um thenable preguiçoso, não uma `Promise` — `.rejects` não o aceita. */
async function captureError(run: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_ID = crypto.randomUUID()
const OTHER_COMPANY_ID = crypto.randomUUID()
const ACTOR_USER_ID = crypto.randomUUID()
const MAIL_TYPE = 'address_correction'

const FIELDS = {
  closing: 'Qualquer dúvida, é só responder este e-mail.\n\n{operador}\n{transportadora}',
  intro: 'Olá, equipe {contratante},',
  itemText: 'Motivo: {motivo}.',
  subject: 'Correção de endereço de entrega — {clientes}',
}

describeDatabase('modelos de e-mail por empresa (spec 150 T402)', () => {
  const databaseName = `transportada_150_t402_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function templates(): DrizzleContractorMailTemplateRepository {
    if (database === undefined) throw new Error('A disposable database is required')
    return new DrizzleContractorMailTemplateRepository(database.db)
  }

  function db(): TestDatabase['db'] {
    if (database === undefined) throw new Error('A disposable database is required')
    return database.db
  }

  function create(input: { readonly companyId: string; readonly name: string }) {
    return templates().create({
      actorUserId: ACTOR_USER_ID,
      companyId: input.companyId,
      mailType: MAIL_TYPE,
      name: input.name,
      ...FIELDS,
    })
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    for (const companyId of [COMPANY_ID, OTHER_COMPANY_ID]) {
      await database.db.execute(
        sql`insert into companies (id, status) values (${companyId}, 'active')`,
      )
    }
  })

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  })

  test('modelo de outra empresa não é listado, lido, editado nem marcado padrão', async () => {
    const foreign = await create({ companyId: OTHER_COMPANY_ID, name: 'Da outra empresa' })

    const listed = await templates().list({ companyId: COMPANY_ID, mailType: MAIL_TYPE })
    expect(listed.map((template) => template.id)).not.toContain(foreign.id)

    expect(
      await templates().find({ companyId: COMPANY_ID, templateId: foreign.id }),
    ).toBeUndefined()

    expect(
      await templates().update({
        actorUserId: ACTOR_USER_ID,
        changes: { name: 'Sequestrado' },
        companyId: COMPANY_ID,
        expectedVersion: foreign.version,
        templateId: foreign.id,
      }),
    ).toBeUndefined()

    expect(
      await templates().setDefault({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        expectedVersion: foreign.version,
        templateId: foreign.id,
      }),
    ).toBeUndefined()

    const untouched = await templates().find({
      companyId: OTHER_COMPANY_ID,
      templateId: foreign.id,
    })
    expect(untouched).toMatchObject({ name: 'Da outra empresa', version: foreign.version })
  })

  test('nome único por empresa e tipo, sem diferenciar caixa e só entre os ativos', async () => {
    await create({ companyId: COMPANY_ID, name: 'Cobrança' })
    await expect(create({ companyId: COMPANY_ID, name: 'COBRANÇA' })).rejects.toBeInstanceOf(
      ContractorMailTemplateNameTakenError,
    )

    const sameNameElsewhere = await create({ companyId: OTHER_COMPANY_ID, name: 'Cobrança' })
    expect(sameNameElsewhere.name).toBe('Cobrança')

    const archivable = await create({ companyId: COMPANY_ID, name: 'Temporário' })
    await templates().update({
      actorUserId: ACTOR_USER_ID,
      changes: { status: 'archived' },
      companyId: COMPANY_ID,
      expectedVersion: archivable.version,
      templateId: archivable.id,
    })
    const reused = await create({ companyId: COMPANY_ID, name: 'Temporário' })
    expect(reused.status).toBe('active')
  })

  test('o banco recusa dois padrões ativos do mesmo tipo na mesma empresa', async () => {
    const [row] = await db().execute<{ id: string }>(sql`
      select id from contractor_mail_templates
      where company_id = ${COMPANY_ID} and is_default and status = 'active'
    `)
    expect(row).toBeDefined()

    const error = await captureError(() =>
      db().execute(sql`
        insert into contractor_mail_templates
          (company_id, mail_type, name, subject, intro, item_text, closing, is_default)
        values (${COMPANY_ID}, ${MAIL_TYPE}, 'Segundo padrão', 'Assunto', 'Abertura', '', 'Fim', true)
      `),
    )
    expect(violatedUniqueConstraint(error)).toBe(
      'contractor_mail_templates_company_type_default_unique',
    )
  })

  test('troca de padrão concorrente nunca deixa dois padrões', async () => {
    const first = await create({ companyId: COMPANY_ID, name: 'Concorrente A' })
    const second = await create({ companyId: COMPANY_ID, name: 'Concorrente B' })

    await Promise.allSettled([
      templates().setDefault({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        expectedVersion: first.version,
        templateId: first.id,
      }),
      templates().setDefault({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        expectedVersion: second.version,
        templateId: second.id,
      }),
    ])

    const defaults = await db().execute<{ id: string }>(sql`
      select id from contractor_mail_templates
      where company_id = ${COMPANY_ID} and mail_type = ${MAIL_TYPE} and is_default and status = 'active'
    `)
    expect(defaults).toHaveLength(1)
    expect([first.id, second.id]).toContain(defaults[0]?.id ?? '')
  })

  test('o primeiro modelo ativo nasce padrão, e arquivar o padrão tira o padrão', async () => {
    const companyId = crypto.randomUUID()
    await db().execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)

    const first = await create({ companyId, name: 'Primeiro' })
    const second = await create({ companyId, name: 'Segundo' })
    expect(first.isDefault).toBe(true)
    expect(second.isDefault).toBe(false)

    const archived = await templates().update({
      actorUserId: ACTOR_USER_ID,
      changes: { status: 'archived' },
      companyId,
      expectedVersion: first.version,
      templateId: first.id,
    })
    expect(archived).toMatchObject({ isDefault: false, status: 'archived' })
    expect(archived?.version).toBe(first.version + 1n)
  })

  test('versão velha não grava (concorrência otimista)', async () => {
    const template = await create({ companyId: COMPANY_ID, name: 'Otimista' })
    const updated = await templates().update({
      actorUserId: ACTOR_USER_ID,
      changes: { subject: 'Novo assunto' },
      companyId: COMPANY_ID,
      expectedVersion: template.version,
      templateId: template.id,
    })
    expect(updated?.subject).toBe('Novo assunto')

    expect(
      await templates().update({
        actorUserId: ACTOR_USER_ID,
        changes: { subject: 'Assunto atrasado' },
        companyId: COMPANY_ID,
        expectedVersion: template.version,
        templateId: template.id,
      }),
    ).toBeUndefined()
  })

  test('a mensagem só aponta para modelo da mesma empresa (FK composta)', async () => {
    const foreign = await create({ companyId: OTHER_COMPANY_ID, name: 'Alvo da FK' })
    const threadId = crypto.randomUUID()
    const [contractor] = await db().execute<{ id: string }>(sql`
      insert into contractors (company_id, tax_id, display_name)
      values (${COMPANY_ID}, '11222333000181', 'Contratante Exemplo')
      returning id
    `)
    await db().execute(sql`
      insert into contractor_mail_threads
        (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash)
      values (${threadId}, ${COMPANY_ID}, ${contractor?.id}, 'address_correction', ${threadId}, ${'e'.repeat(64)})
    `)

    const error = await captureError(() =>
      db().execute(sql`
        insert into contractor_mail_messages
          (company_id, thread_id, direction, from_address, subject, to_addresses, body_text,
           delivery_status, template_id)
        values (${COMPANY_ID}, ${threadId}, 'outbound', 'no-reply@transportada.test', 'Assunto',
          '{ativo@contratante.example}'::text[], 'corpo', 'queued', ${foreign.id})
      `),
    )
    expect(violatedForeignKeyConstraint(error)).toBe('contractor_mail_messages_template_fk')
  })

  test('o envio só acha modelo ativo, do tipo e da própria empresa', async () => {
    const own = await create({ companyId: COMPANY_ID, name: 'Para o envio' })
    const foreign = await create({ companyId: OTHER_COMPANY_ID, name: 'Para o envio de fora' })
    const mail = new DrizzleAddressCorrectionMailRepository(db())

    await mail.execute(async (transaction) => {
      expect(
        await transaction.findMailTemplate({ companyId: COMPANY_ID, templateId: own.id }),
      ).toMatchObject({ id: own.id })
      expect(
        await transaction.findMailTemplate({ companyId: COMPANY_ID, templateId: foreign.id }),
      ).toBeUndefined()
      const byDefault = await transaction.findMailTemplate({ companyId: COMPANY_ID })
      expect(byDefault).toBeDefined()
    })

    await templates().update({
      actorUserId: ACTOR_USER_ID,
      changes: { status: 'archived' },
      companyId: COMPANY_ID,
      expectedVersion: own.version,
      templateId: own.id,
    })
    await mail.execute(async (transaction) => {
      expect(
        await transaction.findMailTemplate({ companyId: COMPANY_ID, templateId: own.id }),
      ).toBeUndefined()
    })
  })

  /**
   * Segurança L2 (revisão final da Fase 4): teto de `CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE` (50)
   * modelos ativos por `(companyId, mailType)` — rede contra cadastro em loop. Arquivar um libera a
   * vaga: o teto conta só `status = 'active'`.
   */
  test('a 51ª criação ativa do mesmo tipo é recusada com CONTRACTOR_MAIL_TEMPLATE_LIMIT_REACHED', async () => {
    const capCompanyId = crypto.randomUUID()
    await db().execute(sql`insert into companies (id, status) values (${capCompanyId}, 'active')`)

    let last
    for (let index = 0; index < CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE; index += 1) {
      last = await create({ companyId: capCompanyId, name: `Modelo ${index}` })
    }

    const error = await captureError(() => create({ companyId: capCompanyId, name: 'Excedente' }))
    expect(error).toBeInstanceOf(ContractorMailTemplateLimitReachedError)

    if (last === undefined) throw new Error('at least one template must have been created')
    await templates().update({
      actorUserId: ACTOR_USER_ID,
      changes: { status: 'archived' },
      companyId: capCompanyId,
      expectedVersion: last.version,
      templateId: last.id,
    })
    const afterArchiving = await create({ companyId: capCompanyId, name: 'Depois de arquivar' })
    expect(afterArchiving.id).toBeTruthy()
  })
})
