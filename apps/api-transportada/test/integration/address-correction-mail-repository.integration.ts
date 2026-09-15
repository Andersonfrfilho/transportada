/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T304: a conversa, a mensagem, o outbox e o `status = 'sent'` dos pedidos só provam a
 * atomicidade contra um Postgres de verdade — a transação inteira comita junto, ou nenhuma parte
 * dela sobrevive quando um passo posterior falha.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { AddressCorrectionRequestNotSendableError } from '../../src/address-correction/domain/address-correction.error.js'
import { DrizzleAddressCorrectionMailRepository } from '../../src/address-correction/infrastructure/drizzle-address-correction-mail.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_ID = crypto.randomUUID()
const OTHER_COMPANY_ID = crypto.randomUUID()
const CONTRACTOR_TAX_ID = '11222333000181'
const ACTOR_USER_ID = crypto.randomUUID()
const ADDRESS_KEY = '3543402|14076988|2296'

describeDatabase(
  'a conversa, a mensagem, o outbox e o status sent comitam juntos (spec 150 T304)',
  () => {
    const databaseName = `transportada_150_t304_${crypto.randomUUID().replaceAll('-', '')}`
    let admin: SQL | undefined
    let database: TestDatabase | undefined
    let contractorId = ''
    let contactId = ''
    let draftRequestId = ''

    function repository(): DrizzleAddressCorrectionMailRepository {
      if (database === undefined) throw new Error('A disposable database is required')
      return new DrizzleAddressCorrectionMailRepository(database.db)
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
      const db = database.db

      for (const companyId of [COMPANY_ID, OTHER_COMPANY_ID]) {
        await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      }
      const [contractor] = await db.execute<{ id: string }>(sql`
      insert into contractors (company_id, tax_id, display_name)
      values (${COMPANY_ID}, ${CONTRACTOR_TAX_ID}, 'Contratante Exemplo')
      returning id
    `)
      contractorId = contractor?.id ?? ''

      const [contact] = await db.execute<{ id: string }>(sql`
      insert into contractor_contacts (company_id, contractor_id, email, status)
      values (${COMPANY_ID}, ${contractorId}, 'ativo@contratante.example', 'active')
      returning id
    `)
      contactId = contact?.id ?? ''
      await db.execute(sql`
      insert into contractor_contacts (company_id, contractor_id, email, status)
      values (${COMPANY_ID}, ${contractorId}, 'inativo@contratante.example', 'inactive')
    `)

      await db.execute(sql`
      insert into contractor_mail_settings
        (company_id, secret_envelope, sender_address, sender_name, reply_domain, status)
      values (
        ${COMPANY_ID}, ${{ algorithm: 'A256GCM', ciphertext: 'x', keyId: 'k', nonce: 'n', version: 1 }}::jsonb,
        'no-reply@transportada.test', 'Transportada', 'reply.transportada.test', 'active'
      )
    `)

      await db.execute(sql`
      insert into company_fiscal_profiles
        (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
         tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
         city_ibge_code, phone, email)
      values (
        ${COMPANY_ID}, 'Transportadora Exemplo Ltda', 'Transportadora Exemplo', '11444777000161',
        'isento', '', '1', '', 'Rua da Empresa', '1', '', 'Centro', 'São Paulo', 'SP', '01000000',
        '3550308', '', ''
      )
    `)

      const [identityUser] = await db.execute<{ id: string }>(sql`
      insert into identity_users (id, status) values (${ACTOR_USER_ID}, 'active') returning id
    `)
      await db.execute(sql`
      insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address)
      values (${identityUser?.id}, 'Maria Operadora', ${`user-${ACTOR_USER_ID}`}, 'email', 'maria@transportada.test')
    `)
      await db.execute(sql`
      insert into user_company_memberships (user_id, company_id, status)
      values (${ACTOR_USER_ID}, ${COMPANY_ID}, 'active')
    `)

      const [draft] = await db.execute<{ id: string }>(sql`
      insert into address_correction_requests
        (company_id, contractor_id, address_key,
         reported_street, reported_number, reported_city_code, reported_city, reported_state,
         reported_postal_code,
         proposed_street, proposed_number, proposed_city_code, proposed_city, proposed_state,
         proposed_postal_code,
         reason_match_level, status)
      values (
        ${COMPANY_ID}, ${contractorId}, ${ADDRESS_KEY},
        'Av Paulista', '45', '3550308', 'São Paulo', 'SP', '01310100',
        'Avenida Paulista', '45', '3550308', 'São Paulo', 'SP', '01310100',
        'street', 'draft'
      )
      returning id
    `)
      draftRequestId = draft?.id ?? ''
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

    test('resolve a contratante e a configuração de e-mail dentro da empresa', async () => {
      await repository().execute(async (transaction) => {
        expect(
          await transaction.findContractorByTaxId({
            companyId: COMPANY_ID,
            taxId: CONTRACTOR_TAX_ID,
          }),
        ).toMatchObject({ id: contractorId })
        expect(
          await transaction.findContractorByTaxId({
            companyId: OTHER_COMPANY_ID,
            taxId: CONTRACTOR_TAX_ID,
          }),
        ).toBeUndefined()
        expect(await transaction.findMailSettings({ companyId: COMPANY_ID })).toMatchObject({
          senderAddress: 'no-reply@transportada.test',
          sendingVerifiedAt: null,
        })
        expect(await transaction.findMailSettings({ companyId: OTHER_COMPANY_ID })).toBeUndefined()
      })
    })

    test('resolve o nome da transportadora e do operador autenticado', async () => {
      await repository().execute(async (transaction) => {
        expect(await transaction.findCarrierName({ companyId: COMPANY_ID })).toBe(
          'Transportadora Exemplo',
        )
        expect(await transaction.findCarrierName({ companyId: OTHER_COMPANY_ID })).toBeUndefined()
        expect(
          await transaction.findOperatorName({ companyId: COMPANY_ID, userId: ACTOR_USER_ID }),
        ).toBe('Maria Operadora')
        expect(
          await transaction.findOperatorName({
            companyId: OTHER_COMPANY_ID,
            userId: ACTOR_USER_ID,
          }),
        ).toBeUndefined()
      })
    })

    test('só resolve contato ativo desta contratante', async () => {
      if (database === undefined) throw new Error('A disposable database is required')
      const [otherContractor] = await database.db.execute<{ id: string }>(sql`
      insert into contractors (company_id, tax_id, display_name)
      values (${COMPANY_ID}, '44555666000199', 'Outra Contratante')
      returning id
    `)
      const [otherContractorContact] = await database.db.execute<{ id: string }>(sql`
      insert into contractor_contacts (company_id, contractor_id, email, status)
      values (${COMPANY_ID}, ${otherContractor?.id}, 'outra@contratante.example', 'active')
      returning id
    `)

      await repository().execute(async (transaction) => {
        const resolved = await transaction.findActiveContactsByIds({
          companyId: COMPANY_ID,
          contactIds: [contactId, otherContractorContact?.id ?? ''],
          contractorId,
        })
        expect(resolved).toEqual([{ email: 'ativo@contratante.example', id: contactId }])
      })
    })

    test('findSendableRequests: draft sem requestIds traz todos, com requestIds valida dono e status', async () => {
      await repository().execute(async (transaction) => {
        const complete = await transaction.findSendableRequests({
          companyId: COMPANY_ID,
          contractorId,
          requestIds: undefined,
        })
        expect(complete.sendable.map((request) => request.id)).toEqual([draftRequestId])
        expect(complete.invalidRequestIds).toEqual([])

        const invalidId = crypto.randomUUID()
        const selection = await transaction.findSendableRequests({
          companyId: COMPANY_ID,
          contractorId,
          requestIds: [draftRequestId, invalidId],
        })
        expect(selection.sendable.map((request) => request.id)).toEqual([draftRequestId])
        expect(selection.invalidRequestIds).toEqual([invalidId])
      })
    })

    test('idempotência: a mesma chave é lida de volta com o mesmo fingerprint e resposta', async () => {
      await repository().execute(async (transaction) => {
        expect(
          await transaction.findIdempotency({
            companyId: COMPANY_ID,
            idempotencyKey: 'never-seen',
          }),
        ).toBeNull()

        await transaction.saveIdempotency({
          companyId: COMPANY_ID,
          fingerprint: 'fingerprint-1',
          idempotencyKey: 'key-1',
          response: { messageId: 'm1', recipientCount: 1, sentRequestIds: ['r1'], threadId: 't1' },
        })

        expect(
          await transaction.findIdempotency({ companyId: COMPANY_ID, idempotencyKey: 'key-1' }),
        ).toEqual({
          fingerprint: 'fingerprint-1',
          response: { messageId: 'm1', recipientCount: 1, sentRequestIds: ['r1'], threadId: 't1' },
        })
      })
    })

    test('recordMail + markRequestsSent comitam juntos: conversa, mensagem, outbox e status sent', async () => {
      const threadId = crypto.randomUUID()

      const { messageId } = await repository().execute(async (transaction) => {
        const recorded = await transaction.recordMail({
          actorUserId: ACTOR_USER_ID,
          bodyHtml: '<p>html</p>',
          bodyText: 'text',
          companyId: COMPANY_ID,
          contractorId,
          correlationId: 'correlation-committed',
          fromAddress: 'no-reply@transportada.test',
          replyTokenHash: 'a'.repeat(64),
          subject: 'Correção de endereço de entrega — 1 cliente',
          threadId,
          toAddresses: ['ativo@contratante.example'],
        })
        await transaction.markRequestsSent({
          companyId: COMPANY_ID,
          requestIds: [draftRequestId],
          threadId,
        })
        return recorded
      })

      if (database === undefined) throw new Error('A disposable database is required')
      const [thread] = await database.db.execute<{
        contractor_id: string
        subject_id: string
        subject_type: string
      }>(
        sql`select contractor_id, subject_id, subject_type from contractor_mail_threads where id = ${threadId}`,
      )
      expect(thread).toMatchObject({
        contractor_id: contractorId,
        subject_id: threadId,
        subject_type: 'address_correction',
      })

      const [message] = await database.db.execute<{
        body_html: string
        body_text: string
        to_addresses: readonly string[]
      }>(
        sql`select body_html, body_text, to_addresses from contractor_mail_messages where id = ${messageId}`,
      )
      expect(message).toMatchObject({
        body_html: '<p>html</p>',
        body_text: 'text',
        to_addresses: ['ativo@contratante.example'],
      })

      const outbox = await database.db.execute<{ event_type: string }>(
        sql`select event_type from contractor_mail_outbox where message_id = ${messageId}`,
      )
      expect(outbox).toHaveLength(1)
      expect(outbox[0]).toMatchObject({ event_type: 'message.send.requested' })

      const [request] = await database.db.execute<{
        status: string
        thread_id: string
        sent_at: Date | null
      }>(
        sql`select status, thread_id, sent_at from address_correction_requests where id = ${draftRequestId}`,
      )
      expect(request).toMatchObject({ status: 'sent', thread_id: threadId })
      expect(request?.sent_at).not.toBeNull()
    })

    test('rollback total: se um passo depois de recordMail falhar, nada comita', async () => {
      if (database === undefined) throw new Error('A disposable database is required')
      const threadId = crypto.randomUUID()

      const [freshDraft] = await database.db.execute<{ id: string }>(sql`
      insert into address_correction_requests
        (company_id, contractor_id, address_key,
         reported_street, reported_number, reported_city_code, reported_city, reported_state,
         reported_postal_code,
         proposed_street, proposed_number, proposed_city_code, proposed_city, proposed_state,
         proposed_postal_code,
         reason_match_level, status)
      values (
        ${COMPANY_ID}, ${contractorId}, '3550308|01310200|46',
        'Av Paulista', '46', '3550308', 'São Paulo', 'SP', '01310200',
        'Avenida Paulista', '46', '3550308', 'São Paulo', 'SP', '01310200',
        'street', 'draft'
      )
      returning id
    `)

      await expect(
        repository().execute(async (transaction) => {
          await transaction.recordMail({
            actorUserId: ACTOR_USER_ID,
            bodyHtml: '<p>rollback</p>',
            bodyText: 'rollback',
            companyId: COMPANY_ID,
            contractorId,
            correlationId: 'correlation-rollback',
            fromAddress: 'no-reply@transportada.test',
            replyTokenHash: 'b'.repeat(64),
            subject: 'Correção de endereço de entrega — 1 cliente',
            threadId,
            toAddresses: ['ativo@contratante.example'],
          })
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      const threads = await database.db.execute(
        sql`select id from contractor_mail_threads where id = ${threadId}`,
      )
      expect(threads).toEqual([])
      const [request] = await database.db.execute<{ status: string }>(
        sql`select status from address_correction_requests where id = ${freshDraft?.id}`,
      )
      expect(request?.status).toBe('draft')
    })

    /**
     * Revisão final, item [ALTO]: dois operadores clicam "enviar" no mesmo rascunho ao mesmo tempo,
     * com `Idempotency-Key` diferentes (duas abas, dois cliques). `findSendableRequests` agora lê a
     * linha com `for('update')`: a segunda transação bloqueia até a primeira comitar, e ao
     * desbloquear vê a linha já `sent` — nunca as duas mandam e-mail. `markRequestsSent` é a segunda
     * trava (retorno vazio → `AddressCorrectionRequestNotSendableError`), reforço para quando o
     * lock por si só não bastasse.
     */
    test('envio concorrente do mesmo rascunho: só um vence, o outro recebe 409, sem e-mail em dobro', async () => {
      if (database === undefined) throw new Error('A disposable database is required')
      const concurrentAddressKey = '3550308|01310300|47'
      const [concurrentDraft] = await database.db.execute<{ id: string }>(sql`
        insert into address_correction_requests
          (company_id, contractor_id, address_key,
           reported_street, reported_number, reported_city_code, reported_city, reported_state,
           reported_postal_code,
           proposed_street, proposed_number, proposed_city_code, proposed_city, proposed_state,
           proposed_postal_code,
           reason_match_level, status)
        values (
          ${COMPANY_ID}, ${contractorId}, ${concurrentAddressKey},
          'Av Paulista', '47', '3550308', 'São Paulo', 'SP', '01310300',
          'Avenida Paulista', '47', '3550308', 'São Paulo', 'SP', '01310300',
          'rooftop', 'draft'
        )
        returning id
      `)
      const concurrentDraftId = concurrentDraft?.id ?? ''

      async function attemptSend(label: string): Promise<{ readonly threadId: string }> {
        const threadId = crypto.randomUUID()
        return repository().execute(async (transaction) => {
          const { invalidRequestIds } = await transaction.findSendableRequests({
            companyId: COMPANY_ID,
            contractorId,
            requestIds: [concurrentDraftId],
          })
          if (invalidRequestIds.length > 0) throw new AddressCorrectionRequestNotSendableError()

          const { messageId } = await transaction.recordMail({
            actorUserId: ACTOR_USER_ID,
            bodyHtml: `<p>${label}</p>`,
            bodyText: label,
            companyId: COMPANY_ID,
            contractorId,
            correlationId: `correlation-concurrent-${label}`,
            fromAddress: 'no-reply@transportada.test',
            replyTokenHash: label === 'a' ? 'c'.repeat(64) : 'd'.repeat(64),
            subject: 'Correção de endereço de entrega — 1 cliente',
            threadId,
            toAddresses: ['ativo@contratante.example'],
          })
          await transaction.markRequestsSent({
            companyId: COMPANY_ID,
            requestIds: [concurrentDraftId],
            threadId,
          })
          return { messageId, threadId }
        })
      }

      const [outcomeA, outcomeB] = await Promise.allSettled([attemptSend('a'), attemptSend('b')])

      const settled = [outcomeA, outcomeB]
      const fulfilled = settled.filter((outcome) => outcome.status === 'fulfilled')
      const rejected = settled.filter((outcome) => outcome.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        AddressCorrectionRequestNotSendableError,
      )

      const winnerThreadId = (fulfilled[0] as PromiseFulfilledResult<{ threadId: string }>).value
        .threadId

      const outboxRows = await database.db.execute<{ event_type: string }>(sql`
        select o.event_type
        from contractor_mail_outbox o
        join contractor_mail_messages m on m.id = o.message_id
        where m.thread_id = ${winnerThreadId}
      `)
      expect(outboxRows).toHaveLength(1)

      const [request] = await database.db.execute<{ status: string; thread_id: string }>(
        sql`select status, thread_id from address_correction_requests where id = ${concurrentDraftId}`,
      )
      expect(request).toMatchObject({ status: 'sent', thread_id: winnerThreadId })
    })
  },
)
