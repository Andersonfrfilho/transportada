/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T102: o pedido de correção de endereço não atravessa empresa. A contratante sai do CNPJ
 * do emitente **dentro** da empresa do token, e um pedido de outra empresa responde como
 * inexistente — nem aparece na leitura, nem é sobrescrito pela gravação. Só se prova contra um
 * Postgres de verdade: o rascunho único é um índice parcial e a contratante é uma FK composta.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  AddressFields,
  UpsertAddressCorrectionDraftParams,
} from '../../src/address-correction/application/address-correction.port.js'
import { DrizzleAddressCorrectionRepository } from '../../src/address-correction/infrastructure/drizzle-address-correction.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SHARED_TAX_ID = '11222333000181'
const ONLY_IN_B_TAX_ID = '44555666000199'
const ADDRESS_KEY = '3543402|14076988|2296'

const REPORTED: AddressFields = {
  city: 'Ribeirão Preto',
  cityCode: '3543402',
  complement: null,
  district: 'Centro',
  number: '2296',
  postalCode: '14076988',
  state: 'SP',
  street: 'Rua Um',
}
const PROPOSED: AddressFields = { ...REPORTED, postalCode: '14076900', street: 'Rua Dois' }

describeDatabase('o pedido de correção não atravessa empresa (spec 150 T102)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const databaseName = `transportada_150_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined
  let contractorA = ''
  let contractorB = ''

  function repository(): DrizzleAddressCorrectionRepository {
    if (database === undefined) throw new Error('A disposable database is required')
    return new DrizzleAddressCorrectionRepository(database.db)
  }

  function draftParams(
    overrides: Partial<UpsertAddressCorrectionDraftParams> & {
      readonly companyId: string
      readonly contractorId: string
    },
  ): UpsertAddressCorrectionDraftParams {
    return {
      actorUserId: null,
      addressKey: ADDRESS_KEY,
      proposed: PROPOSED,
      reasonDistanceMetres: '1250.50',
      reasonMatchLevel: 'far',
      recipientName: 'Destinatário',
      reported: REPORTED,
      ...overrides,
    }
  }

  async function insertContractor(params: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<string> {
    if (database === undefined) throw new Error('A disposable database is required')
    const rows = await database.db.execute<{ id: string }>(sql`
      insert into contractors (company_id, tax_id) values (${params.companyId}, ${params.taxId})
      returning id
    `)
    const id = rows[0]?.id
    if (id === undefined) throw new Error('contractor not inserted')
    return id
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    for (const companyId of [companyA, companyB]) {
      await database.db.execute(
        sql`insert into companies (id, status) values (${companyId}, 'active')`,
      )
    }
    contractorA = await insertContractor({ companyId: companyA, taxId: SHARED_TAX_ID })
    contractorB = await insertContractor({ companyId: companyB, taxId: SHARED_TAX_ID })
    await insertContractor({ companyId: companyB, taxId: ONLY_IN_B_TAX_ID })
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

  test('a contratante sai do CNPJ do emitente dentro da empresa informada', async () => {
    expect(
      await repository().findContractorByTaxId({ companyId: companyA, taxId: SHARED_TAX_ID }),
    ).toMatchObject({ id: contractorA })
    expect(
      await repository().findContractorByTaxId({ companyId: companyB, taxId: SHARED_TAX_ID }),
    ).toMatchObject({ id: contractorB })
    /** O mesmo CNPJ cadastrado só em outra empresa não é encontrado. */
    expect(
      await repository().findContractorByTaxId({ companyId: companyA, taxId: ONLY_IN_B_TAX_ID }),
    ).toBeUndefined()
  })

  test('o rascunho de uma empresa não aparece nem é sobrescrito pela outra', async () => {
    const draftA = await repository().upsertDraft(
      draftParams({ companyId: companyA, contractorId: contractorA }),
    )

    expect(
      await repository().findByAddressKeys({ addressKeys: [ADDRESS_KEY], companyId: companyB }),
    ).toEqual([])
    expect(
      await repository().listDraftsByContractor({ companyId: companyB, contractorId: contractorA }),
    ).toEqual([])

    const draftB = await repository().upsertDraft(
      draftParams({
        companyId: companyB,
        contractorId: contractorB,
        proposed: { ...PROPOSED, street: 'Rua da Empresa B' },
      }),
    )

    expect(draftB.id).not.toBe(draftA.id)
    expect(draftB.companyId).toBe(companyB)
    const [stillA] = await repository().findByAddressKeys({
      addressKeys: [ADDRESS_KEY],
      companyId: companyA,
    })
    expect(stillA).toMatchObject({ id: draftA.id, proposed: PROPOSED, status: 'draft' })
  })

  test('um rascunho por endereço: salvar de novo atualiza o mesmo registro', async () => {
    const [before] = await repository().findByAddressKeys({
      addressKeys: [ADDRESS_KEY],
      companyId: companyA,
    })
    const updated = await repository().upsertDraft(
      draftParams({
        companyId: companyA,
        contractorId: contractorA,
        proposed: { ...PROPOSED, number: '2300' },
      }),
    )

    expect(updated.id).toBe(before?.id ?? '')
    expect(updated.proposed.number).toBe('2300')
    expect(
      await repository().listDraftsByContractor({ companyId: companyA, contractorId: contractorA }),
    ).toHaveLength(1)
  })

  test('um pedido enviado não é reaberto: o rascunho novo é outra linha', async () => {
    if (database === undefined) throw new Error('A disposable database is required')
    await database.db.execute(sql`
      update address_correction_requests set status = 'sent', sent_at = now()
      where company_id = ${companyA} and address_key = ${ADDRESS_KEY}
    `)

    const fresh = await repository().upsertDraft(
      draftParams({ companyId: companyA, contractorId: contractorA }),
    )
    const rows = await repository().findByAddressKeys({
      addressKeys: [ADDRESS_KEY],
      companyId: companyA,
    })

    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.status === 'sent')).toHaveLength(1)
    expect(rows.find((row) => row.status === 'draft')?.id).toBe(fresh.id)
    expect(rows.find((row) => row.status === 'sent')?.proposed.number).toBe('2300')
  })

  /** T103 (`GET /address-correction-requests`): a listagem por empresa nunca cruza tenant. */
  test('listByCompany devolve só os pedidos da própria empresa, de qualquer status', async () => {
    const forA = await repository().listByCompany({ companyId: companyA })
    expect(forA.length).toBeGreaterThan(0)
    expect(forA.every((row) => row.companyId === companyA)).toBe(true)

    const forB = await repository().listByCompany({ companyId: companyB })
    expect(forB.some((row) => row.id === forA[0]?.id)).toBe(false)
  })

  test('a FK composta recusa contratante de outra empresa', async () => {
    await expect(
      repository().upsertDraft(
        draftParams({
          addressKey: '3543402|14000000|1',
          companyId: companyA,
          contractorId: contractorB,
        }),
      ),
    ).rejects.toThrow()
    expect(
      await repository().findByAddressKeys({
        addressKeys: ['3543402|14000000|1'],
        companyId: companyA,
      }),
    ).toEqual([])
  })

  /**
   * H3 ("vejo... quando e para quem", revisão final): `recipientCount` nunca é uma coluna própria
   * — só se prova lendo de verdade a mensagem `outbound` da conversa ligada pelo `thread_id`.
   */
  test('listByCompany lê recipientCount da mensagem outbound da conversa ligada', async () => {
    if (database === undefined) throw new Error('A disposable database is required')
    const threadId = crypto.randomUUID()
    const sentAddressKey = '3543402|14076988|9001'

    await database.db.execute(sql`
      insert into contractor_mail_threads
        (id, company_id, contractor_id, subject_id, subject_type, reply_token_hash)
      values (${threadId}, ${companyA}, ${contractorA}, ${threadId}, 'address_correction', ${'e'.repeat(64)})
    `)
    await database.db.execute(sql`
      insert into address_correction_requests
        (company_id, contractor_id, address_key,
         reported_street, reported_number, reported_city_code, reported_city, reported_state,
         reported_postal_code,
         proposed_street, proposed_number, proposed_city_code, proposed_city, proposed_state,
         proposed_postal_code,
         reason_match_level, status, thread_id, sent_at)
      values (
        ${companyA}, ${contractorA}, ${sentAddressKey},
        'Rua Um', '9001', '3543402', 'Ribeirão Preto', 'SP', '14076988',
        'Rua Dois', '9001', '3543402', 'Ribeirão Preto', 'SP', '14076900',
        'rooftop', 'sent', ${threadId}, now()
      )
    `)
    await database.db.execute(sql`
      insert into contractor_mail_messages
        (company_id, thread_id, direction, from_address, to_addresses, subject, body_text,
         delivery_status)
      values (
        ${companyA}, ${threadId}, 'outbound', 'no-reply@transportada.test',
        array['um@example.com', 'dois@example.com', 'tres@example.com'],
        'Correção de endereço de entrega — 1 cliente', 'texto', 'queued'
      )
    `)

    const rows = await repository().listByCompany({ companyId: companyA })
    const sentRow = rows.find((row) => row.addressKey === sentAddressKey)
    expect(sentRow?.recipientCount).toBe(3)

    const draftRow = rows.find((row) => row.status === 'draft')
    expect(draftRow?.recipientCount).toBeNull()
  })
})
