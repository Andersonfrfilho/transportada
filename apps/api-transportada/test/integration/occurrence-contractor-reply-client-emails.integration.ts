/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3 (D3/D4, CA2), contra Postgres real: o boleto da contratante aos e-mails para boleto do cadastro do
 * cliente de entrega (o destinatário da nota). Um e-mail por endereço no trilho da 248, idempotente por (retorno,
 * anexo, endereço); o endereço novo só entra no cadastro com `save`, sem duplicar e com `audit_logs`; o `emailId` de
 * outro cliente ou de outra empresa não envia; a leitura das opções traz o cadastro só mascarado.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  auditLogs,
  companyOccurrenceTypes,
  contractorMailMessages,
  deliveryClientContacts,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import type { ForwardContractorReplyToClientInput } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import type { ClientEmailType } from '../../src/shared/delivery-client-email.constant.js'
import { OccurrenceClientEmailOffError } from '../../src/trips/domain/occurrence-client-email.error.js'
import {
  ContractorReplyClientEmailNotFoundError,
  ContractorReplyEmailDeliveryNotFoundError,
  ContractorReplyEmailRetryNotAllowedError,
} from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '12345678000188'
const FINANCE_EMAIL = 'financeiro@mercado.example.test'
const OWNER_EMAIL = 'dono@mercado.example.test'
const NEW_EMAIL = 'novo@mercado.example.test'

/** O destinatário da nota com cadastro de cliente e os dois e-mails para boleto (mais um de outro tipo). */
async function seedClient(database: TestDatabase, seeded: Seeded) {
  const { companyId, userId } = seeded.company
  const [document] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocumentOccurrences)
    .innerJoin(tripDocuments, eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId))
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (document?.nfeDocumentId === null || document?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: document.nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Mercado Beta',
    role: 'recipient',
    taxId: CLIENT_TAX_ID,
  })
  await database.db.insert(deliveryClients).values({
    companyId,
    displayName: 'Mercado Beta',
    taxId: CLIENT_TAX_ID,
  })
  const emails = await database.db
    .insert(deliveryClientContacts)
    .values(
      [
        { address: FINANCE_EMAIL, label: 'financeiro', purpose: 'boleto' as const },
        { address: OWNER_EMAIL, label: 'dono', purpose: 'boleto' as const },
        { address: 'nota@mercado.example.test', label: '', purpose: 'invoice' as const },
      ].map((email) => ({
        ...email,
        companyId,
        createdByKind: 'office' as const,
        createdByUserId: userId,
        taxId: CLIENT_TAX_ID,
      })),
    )
    .returning({ id: deliveryClientContacts.id, purpose: deliveryClientContacts.purpose })
  const [finance, owner, invoice] = emails
  if (finance === undefined || owner === undefined || invoice === undefined) {
    throw new Error('EXPECTED_CLIENT_EMAILS')
  }
  return { financeId: finance.id, invoiceId: invoice.id, ownerId: owner.id }
}

/** Spec 279 RF9: o tipo da ocorrência liga o envio ao cliente e diz o tipo de e-mail. */
async function setClientEmailType(
  database: TestDatabase,
  seeded: Seeded,
  clientEmailType: ClientEmailType,
): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (occurrence?.typeId === null || occurrence?.typeId === undefined) {
    throw new Error('EXPECTED_OCCURRENCE_TYPE')
  }
  await database.db
    .update(companyOccurrenceTypes)
    .set({ clientEmailType })
    .where(eq(companyOccurrenceTypes.id, occurrence.typeId))
}

/** Spec 286 T9: sem o texto antigo, o boleto ao cliente sai do modelo escolhido no canal de e-mail do tipo. */
async function seedClientEmailTemplate(database: TestDatabase, seeded: Seeded): Promise<void> {
  const { companyId } = seeded.company
  const templateKey = 'occurrence.client-reply.teste'
  await database.db.execute(sql`
    insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
    values (${companyId}, ${templateKey}, 'email', 'pt-BR', 1, 'Boleto com novo vencimento', 'Segue o boleto prorrogado.', true)`)
  await database.db.execute(sql`
    insert into company_occurrence_type_client_channels (company_id, occurrence_type_id, channel, enabled, send_mode, template_key)
    select ${companyId}, occurrence.occurrence_type_id, 'email', true, 'manual', ${templateKey}
    from trip_document_occurrences occurrence
    where occurrence.id = ${seeded.occurrenceId}
    on conflict (company_id, occurrence_type_id, channel)
      do update set enabled = true, send_mode = 'manual', template_key = excluded.template_key`)
}

async function prepare(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  const received = await receivePdfReply(database, { companyId, conversationId })
  const client = await seedClient(database, seeded)
  await setClientEmailType(database, seeded, 'boleto')
  await seedClientEmailTemplate(database, seeded)
  const useCase = createForwardContractorReplyByEmailUseCase({
    unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
  })
  return { ...received, client, companyId, seeded, useCase }
}

function inputOf(
  seeded: Seeded,
  overrides: Partial<ForwardContractorReplyToClientInput> = {},
): ForwardContractorReplyToClientInput {
  return {
    actorUserId: seeded.company.userId,
    authorKind: 'office',
    companyId: seeded.company.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    emailIds: [],
    idempotencyKey: `key-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    save: false,
    ...overrides,
  }
}

function clientDeliveriesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      address: occurrenceContractorReplyDeliveries.address,
      status: occurrenceContractorReplyDeliveries.status,
      toAddresses: contractorMailMessages.toAddresses,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .innerJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceContractorReplyDeliveries.companyId),
        eq(contractorMailMessages.id, occurrenceContractorReplyDeliveries.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

describe('o boleto aos e-mails do cadastro do cliente (spec 279 T3, CA2)', () => {
  testWithPostgres(
    'um e-mail por endereço escolhido, e repetir com outra chave não duplica',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, seeded, useCase } = await prepare(database)
        const emailIds = [client.financeId, client.ownerId]

        const first = await useCase.forwardToClient(inputOf(seeded, { emailIds }))
        expect(first.results.map((result) => [result.emailId, result.kind])).toEqual([
          [client.financeId, 'queued'],
          [client.ownerId, 'queued'],
        ])
        expect(JSON.stringify(first)).not.toContain(FINANCE_EMAIL)
        const deliveries = await clientDeliveriesOf(database, companyId)
        expect(deliveries.map((row) => row.toAddresses).toSorted()).toEqual([
          [OWNER_EMAIL],
          [FINANCE_EMAIL],
        ])
        expect(
          deliveries.every((row) => row.status === 'queued' && row.trigger === 'operator'),
        ).toBe(true)

        const repeated = await useCase.forwardToClient(inputOf(seeded, { emailIds }))
        expect(repeated.results.map((result) => result.kind)).toEqual([
          'already_queued',
          'already_queued',
        ])
        expect(await clientDeliveriesOf(database, companyId)).toHaveLength(2)
      })
    },
    60_000,
  )

  testWithPostgres(
    'endereço novo com save entra no cadastro uma vez, com autor e auditoria, e sai',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)

        const outcome = await useCase.forwardToClient(
          inputOf(seeded, { address: NEW_EMAIL, authorKind: 'driver', save: true }),
        )
        expect(outcome.results).toMatchObject([{ kind: 'queued' }])
        expect(outcome.savedEmailId).not.toBeNull()

        const saved = await database.db
          .select({
            address: deliveryClientContacts.address,
            createdByKind: deliveryClientContacts.createdByKind,
            id: deliveryClientContacts.id,
          })
          .from(deliveryClientContacts)
          .where(
            and(
              eq(deliveryClientContacts.companyId, companyId),
              eq(deliveryClientContacts.address, NEW_EMAIL),
            ),
          )
        expect(saved).toEqual([
          { address: NEW_EMAIL, createdByKind: 'driver', id: outcome.savedEmailId ?? '' },
        ])
        const audits = await database.db
          .select({ metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, companyId),
              eq(auditLogs.action, 'delivery-client-email.created'),
            ),
          )
        expect(audits).toHaveLength(1)
        expect(JSON.stringify(audits)).not.toContain(NEW_EMAIL)

        const again = await useCase.forwardToClient(
          inputOf(seeded, { address: NEW_EMAIL.toUpperCase(), save: true }),
        )
        expect(again.savedEmailId).toBe(outcome.savedEmailId)
        expect(again.results).toMatchObject([{ kind: 'already_queued' }])
        const count = await database.db
          .select({ id: deliveryClientContacts.id })
          .from(deliveryClientContacts)
          .where(eq(deliveryClientContacts.companyId, companyId))
        expect(count).toHaveLength(4)
      })
    },
    60_000,
  )

  testWithPostgres(
    'tipo off recusa, emailId de outro tipo ou de outra empresa não envia, e a leitura mostra o cadastro mascarado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, seeded, useCase } = await prepare(database)
        await expect(
          useCase.forwardToClient(inputOf(seeded, { emailIds: [client.invoiceId] })),
        ).rejects.toBeInstanceOf(ContractorReplyClientEmailNotFoundError)

        await setClientEmailType(database, seeded, 'off')
        await expect(
          useCase.forwardToClient(inputOf(seeded, { emailIds: [client.financeId] })),
        ).rejects.toBeInstanceOf(OccurrenceClientEmailOffError)
        const offOptions = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(offOptions).toMatchObject({ clientEmailType: 'off', clientEmails: [] })
        await setClientEmailType(database, seeded, 'boleto')

        const foreign = await seedMailScenario(database)
        const foreignClient = await seedClient(database, foreign)
        await expect(
          useCase.forwardToClient(inputOf(seeded, { emailIds: [foreignClient.financeId] })),
        ).rejects.toBeInstanceOf(ContractorReplyClientEmailNotFoundError)
        expect(await clientDeliveriesOf(database, companyId)).toEqual([])

        const options = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        /** Mesmo `created_at` no lote: a ordem desempata pelo id, então a prova é o conjunto. */
        expect(options?.clientEmails).toHaveLength(2)
        expect(options?.clientEmails).toEqual(
          expect.arrayContaining([
            {
              addressMasked: 'f***@m***.example.test',
              emailId: client.financeId,
              label: 'financeiro',
            },
            { addressMasked: 'd***@m***.example.test', emailId: client.ownerId, label: 'dono' },
          ]),
        )
        expect(JSON.stringify(options)).not.toContain(FINANCE_EMAIL)
      })
    },
    90_000,
  )
})

describe('estado Enviado/Falhou e "Tentar de novo" (spec 279 T6b, RF12)', () => {
  async function deliveryRows(database: TestDatabase, companyId: string) {
    return database.db
      .select({
        id: occurrenceContractorReplyDeliveries.id,
        idempotencyKey: occurrenceContractorReplyDeliveries.idempotencyKey,
        reason: occurrenceContractorReplyDeliveries.reason,
        status: occurrenceContractorReplyDeliveries.status,
        toAddresses: contractorMailMessages.toAddresses,
      })
      .from(occurrenceContractorReplyDeliveries)
      .innerJoin(
        contractorMailMessages,
        eq(contractorMailMessages.id, occurrenceContractorReplyDeliveries.mailMessageId),
      )
      .where(
        and(
          eq(occurrenceContractorReplyDeliveries.companyId, companyId),
          eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
        ),
      )
      .orderBy(occurrenceContractorReplyDeliveries.createdAt)
  }

  testWithPostgres(
    'a recusa do provedor vira Falhou, e o "Tentar de novo" sai de novo com chave nova, sem duplicar',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, seeded, useCase } = await prepare(database)
        await useCase.forwardToClient(inputOf(seeded, { emailIds: [client.financeId] }))
        const [first] = await deliveryRows(database, companyId)
        if (first === undefined) throw new Error('EXPECTED_DELIVERY')

        /** O que o worker grava quando o provedor recusa (`markMessageFailed`). */
        await database.db
          .update(occurrenceContractorReplyDeliveries)
          .set({ reason: 'send_failed', status: 'failed' })
          .where(eq(occurrenceContractorReplyDeliveries.id, first.id))
        const options = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(options?.deliveries).toMatchObject([
          {
            address: FINANCE_EMAIL,
            addressMasked: 'f***@m***.example.test',
            id: first.id,
            reason: 'send_failed',
            sentAt: null,
            status: 'failed',
            target: 'client_boleto_emails',
          },
        ])

        const retry = {
          actorUserId: seeded.company.userId,
          authorKind: 'office',
          companyId,
          correlationId: 'correlation-retry',
          deliveryId: first.id,
          occurrenceId: seeded.occurrenceId,
        } as const
        const outcome = await useCase.retryToClient(retry)
        expect(outcome.results).toMatchObject([{ kind: 'queued' }])
        expect(JSON.stringify(outcome)).not.toContain(FINANCE_EMAIL)
        const repeated = await useCase.retryToClient(retry)
        expect(repeated.results).toMatchObject([{ kind: 'already_queued' }])

        const rows = await deliveryRows(database, companyId)
        expect(rows.map((row) => [row.status, row.toAddresses])).toEqual([
          ['failed', [FINANCE_EMAIL]],
          ['queued', [FINANCE_EMAIL]],
        ])
        expect(new Set(rows.map((row) => row.idempotencyKey)).size).toBe(2)

        const queued = rows[1]
        if (queued === undefined) throw new Error('EXPECTED_RETRY')
        await expect(
          useCase.retryToClient({ ...retry, deliveryId: queued.id }),
        ).rejects.toBeInstanceOf(ContractorReplyEmailRetryNotAllowedError)
        await expect(
          useCase.retryToClient({ ...retry, deliveryId: crypto.randomUUID() }),
        ).rejects.toBeInstanceOf(ContractorReplyEmailDeliveryNotFoundError)
      })
    },
    90_000,
  )

  testWithPostgres(
    'o aviso do sistema só nasce automático e de saída, sai nas leituras e não vira "aguardando o motorista"',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded } = await prepare(database)
        const [conversation] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            driverUserId: seeded.company.userId,
            occurrenceId: seeded.occurrenceId,
            occurrenceKind: 'document',
            participant: 'driver',
          })
          .returning({ id: occurrenceConversations.id })
        if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
        const base = {
          bodyText: `Boleto enviado para o e-mail: ${FINANCE_EMAIL}`,
          channel: 'app',
          companyId,
          conversationId: conversation.id,
          direction: 'outbound',
          status: 'delivered',
          systemNotice: {
            actorKind: 'office',
            actorName: 'Marta Operadora',
            deliveryId: crypto.randomUUID(),
            kind: 'client_boleto_email_sent',
          },
        } as const

        const humanAuthored = database.db
          .insert(occurrenceConversationMessages)
          .values({ ...base, authorUserId: seeded.company.userId, automatic: false })
        await expect(Promise.resolve(humanAuthored)).rejects.toThrow()
        const inbound = database.db.insert(occurrenceConversationMessages).values({
          ...base,
          automatic: false,
          direction: 'inbound',
          driverUserId: seeded.company.userId,
          status: null,
        })
        await expect(Promise.resolve(inbound)).rejects.toThrow()

        await database.db
          .insert(occurrenceConversationMessages)
          .values({ ...base, automatic: true })
        const duplicate = database.db
          .insert(occurrenceConversationMessages)
          .values({ ...base, automatic: true })
        await expect(Promise.resolve(duplicate)).rejects.toThrow()

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const driverSide = view?.conversations.find((entry) => entry.participant === 'driver')
        expect(driverSide?.messages).toMatchObject([
          {
            author: { kind: 'automatic' },
            bodyText: `Boleto enviado para o e-mail: ${FINANCE_EMAIL}`,
            systemNotice: {
              actorKind: 'office',
              actorName: 'Marta Operadora',
              kind: 'client_boleto_email_sent',
            },
          },
        ])
        expect(driverSide?.unreadCount).toBe(0)

        const driverMessages = await createDrizzleDriverConversationUnitOfWork(database.db).execute(
          (transaction) =>
            transaction.listDriverMessages({
              companyId,
              driverUserId: seeded.company.userId,
              occurrenceId: seeded.occurrenceId,
              occurrenceKind: 'document',
            }),
        )
        expect(driverMessages).toMatchObject([
          { direction: 'outbound', systemNotice: { actorKind: 'office' } },
        ])
      })
    },
    90_000,
  )
})
