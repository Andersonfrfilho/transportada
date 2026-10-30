/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5, contra Postgres real: o boleto por WhatsApp (Evolution) ao cliente da nota, com o Evolution simulado.
 * A entrega grava o número em E.164 e o id do provedor; o aviso entra na conversa do motorista no canal `whatsapp`;
 * o envio repetido não chama o Evolution de novo; o número novo entra no cadastro só com `save`; `audit_logs` leva
 * o número mascarado; o teto diário conta só o WhatsApp da empresa; as opções saem mascaradas.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  companyOccurrenceTypes,
  deliveryClientContacts,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
  whatsappEvolutionSettings,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByWhatsAppUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import type { ForwardContractorReplyByWhatsAppInput } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import { ContractorReplyWhatsAppDailyCapReachedError } from '../../src/occurrence-conversation/domain/contractor-reply-whatsapp.error.js'
import {
  createDrizzleContractorReplyWhatsAppCompletion,
  createDrizzleContractorReplyWhatsAppReader,
  createDrizzleContractorReplyWhatsAppUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-whatsapp.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import type { ClientChannel } from '../../src/shared/delivery-client-email.constant.js'
import {
  openReplyWithForward,
  seedContractorReplyChannelTemplate,
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
const SAVED_NUMBER = '+5511988887777'
const NEW_NUMBER = '+5516999998888'
const ENVELOPE = { algorithm: 'A256GCM', ciphertext: 'c', keyId: 'k', nonce: 'n', version: 1 }

async function seedClient(database: TestDatabase, seeded: Seeded): Promise<string> {
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
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Mercado Beta', taxId: CLIENT_TAX_ID })
  const [contact] = await database.db
    .insert(deliveryClientContacts)
    .values({
      address: SAVED_NUMBER,
      channel: 'whatsapp',
      companyId,
      createdByKind: 'office',
      createdByUserId: userId,
      label: 'dono',
      purpose: 'boleto',
      taxId: CLIENT_TAX_ID,
    })
    .returning({ id: deliveryClientContacts.id })
  if (contact === undefined) throw new Error('EXPECTED_CONTACT')
  return contact.id
}

async function setClientChannel(
  database: TestDatabase,
  seeded: Seeded,
  clientChannel: ClientChannel,
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
    .set({ clientChannel })
    .where(eq(companyOccurrenceTypes.id, occurrence.typeId))
}

async function prepare(database: TestDatabase, options: { readonly dailyCap?: number } = {}) {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  await receivePdfReply(database, { companyId, conversationId })
  const contactId = await seedClient(database, seeded)
  await setClientChannel(database, seeded, 'both')
  await seedContractorReplyChannelTemplate(
    database,
    seeded,
    'whatsapp',
    'Segue o boleto prorrogado.',
  )
  await database.db.insert(whatsappEvolutionSettings).values({
    baseUrl: 'https://evolution.example.test',
    companyId,
    connectionState: 'open',
    dailyCap: options.dailyCap ?? 50,
    instanceName: 'empresa-teste',
    riskAcknowledgedAt: new Date(),
    riskAcknowledgedBy: userId,
    secretEnvelope: ENVELOPE,
    status: 'active',
  })
  const [driverConversation] = await database.db
    .insert(occurrenceConversations)
    .values({
      companyId,
      driverUserId: userId,
      occurrenceId: seeded.occurrenceId,
      occurrenceKind: 'document',
      participant: 'driver',
    })
    .returning({ id: occurrenceConversations.id })
  if (driverConversation === undefined) throw new Error('EXPECTED_DRIVER_CONVERSATION')

  const sends: string[] = []
  const useCase = createForwardContractorReplyByWhatsAppUseCase({
    attachments: { read: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
    completion: createDrizzleContractorReplyWhatsAppCompletion(database.db),
    now: () => new Date(),
    sender: {
      isConnected: async () => true,
      sendDocument: async ({ number }) => {
        sends.push(number)
        return { providerMessageId: `wamid-${crypto.randomUUID()}` }
      },
    },
    unitOfWork: createDrizzleContractorReplyWhatsAppUnitOfWork(database.db),
  })
  return {
    companyId,
    contactId,
    driverConversationId: driverConversation.id,
    seeded,
    sends,
    useCase,
  }
}

function inputOf(
  seeded: Seeded,
  overrides: Partial<ForwardContractorReplyByWhatsAppInput> = {},
): ForwardContractorReplyByWhatsAppInput {
  return {
    actorUserId: seeded.company.userId,
    authorKind: 'office',
    companyId: seeded.company.companyId,
    contactIds: [],
    correlationId: `correlation-${crypto.randomUUID()}`,
    idempotencyKey: `key-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    save: false,
    ...overrides,
  }
}

describe('o boleto por WhatsApp ao cliente (spec 281 T5)', () => {
  testWithPostgres(
    'um envio por número, com o id do provedor, aviso no chat do motorista e auditoria mascarada',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contactId, driverConversationId, seeded, sends, useCase } =
          await prepare(database)

        const first = await useCase.forward(
          inputOf(seeded, { contactIds: [contactId], number: '(16) 99999-8888', save: true }),
        )
        expect(first.results.map((result) => [result.numberMasked, result.kind])).toEqual([
          ['+55 ••••7777', 'sent'],
          ['+55 ••••8888', 'sent'],
        ])
        expect(JSON.stringify(first)).not.toContain('99999')
        expect(sends).toEqual([SAVED_NUMBER, NEW_NUMBER])

        const again = await useCase.forward(inputOf(seeded, { number: '+55 16 99999-8888' }))
        expect(again.results[0]?.kind).toBe('already_sent')
        expect(sends).toHaveLength(2)

        const deliveries = await database.db
          .select({
            address: occurrenceContractorReplyDeliveries.address,
            providerMessageId: occurrenceContractorReplyDeliveries.providerMessageId,
            sentAt: occurrenceContractorReplyDeliveries.sentAt,
            status: occurrenceContractorReplyDeliveries.status,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(
            and(
              eq(occurrenceContractorReplyDeliveries.companyId, companyId),
              eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_whatsapp'),
            ),
          )
        expect(deliveries.map((row) => row.address).toSorted()).toEqual([SAVED_NUMBER, NEW_NUMBER])
        expect(
          deliveries.every(
            (row) => row.status === 'sent' && row.sentAt !== null && row.providerMessageId !== null,
          ),
        ).toBe(true)

        const saved = await database.db
          .select({
            address: deliveryClientContacts.address,
            channel: deliveryClientContacts.channel,
          })
          .from(deliveryClientContacts)
          .where(eq(deliveryClientContacts.id, first.savedContactId ?? ''))
        expect(saved).toEqual([{ address: NEW_NUMBER, channel: 'whatsapp' }])

        const audits = await database.db
          .select({ action: auditLogs.action, metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(eq(auditLogs.companyId, companyId))
        const whatsappAudits = audits.filter(
          (row) => row.action.includes('whatsapp') || row.action.includes('contact'),
        )
        expect(whatsappAudits.map((row) => row.action).toSorted()).toEqual([
          'contractor-reply.whatsapp-delivery.requested',
          'contractor-reply.whatsapp-delivery.requested',
          'delivery-client-contact.created',
        ])
        expect(JSON.stringify(whatsappAudits)).not.toContain('99999')

        const notices = await database.db
          .select({
            bodyText: occurrenceConversationMessages.bodyText,
            channel: occurrenceConversationMessages.channel,
            providerMessageId: occurrenceConversationMessages.providerMessageId,
            status: occurrenceConversationMessages.status,
            systemNotice: occurrenceConversationMessages.systemNotice,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              /** Spec 283: o envio também entra na conversa do cliente; o aviso é só o do motorista. */
              eq(occurrenceConversationMessages.conversationId, driverConversationId),
            ),
          )
        const whatsappNotices = notices.filter((row) => row.channel === 'whatsapp')
        expect(whatsappNotices).toHaveLength(2)
        expect(whatsappNotices.map((row) => row.bodyText).toSorted()).toEqual([
          `Boleto enviado por WhatsApp: (11) 98888-7777`,
          `Boleto enviado por WhatsApp: (16) 99999-8888`,
        ])
        expect(
          whatsappNotices.every(
            (row) =>
              row.status === 'sent' &&
              row.providerMessageId !== null &&
              row.systemNotice?.kind === 'client_boleto_whatsapp_sent' &&
              row.systemNotice.actorKind === 'driver',
          ),
        ).toBe(true)

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const driverSide = view?.conversations.find((entry) => entry.participant === 'driver')
        expect(driverSide?.messages.map((message) => message.systemNotice?.kind)).toEqual([
          'client_boleto_whatsapp_sent',
          'client_boleto_whatsapp_sent',
        ])
      })
    },
    90_000,
  )

  testWithPostgres(
    'as opções saem mascaradas e o teto diário da empresa recusa antes de reservar',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, sends, useCase } = await prepare(database, { dailyCap: 1 })
        await useCase.forward(inputOf(seeded, { number: '16999998888' }))
        await expect(
          useCase.forward(inputOf(seeded, { number: '11 98888-7777' })),
        ).rejects.toBeInstanceOf(ContractorReplyWhatsAppDailyCapReachedError)
        expect(sends).toHaveLength(1)

        const options = await createDrizzleContractorReplyWhatsAppReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(options).toMatchObject({
          clientChannel: 'both',
          contacts: [{ label: 'dono', numberMasked: '+55 ••••7777' }],
          deliveries: [{ numberMasked: '+55 ••••8888', status: 'sent' }],
          evolution: { connectionState: 'open', ready: true, status: 'active' },
          sentCount: 1,
        })
        expect(JSON.stringify(options)).not.toContain('99999')
      })
    },
    90_000,
  )

  testWithPostgres(
    'o banco recusa número fora do E.164 e id de provedor em outro alvo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)
        await useCase.forward(inputOf(seeded, { number: '16999998888' }))
        const [delivery] = await database.db
          .select({ id: occurrenceContractorReplyDeliveries.id })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId))
        const badNumber = database.db
          .update(occurrenceContractorReplyDeliveries)
          .set({ address: '16999998888' })
          .where(eq(occurrenceContractorReplyDeliveries.id, delivery?.id ?? ''))
        await expect(Promise.resolve(badNumber)).rejects.toThrow()
        const otherTarget = database.db
          .update(occurrenceContractorReplyDeliveries)
          .set({ address: 'a@b.example.test', target: 'client_boleto_emails' })
          .where(eq(occurrenceContractorReplyDeliveries.id, delivery?.id ?? ''))
        await expect(Promise.resolve(otherTarget)).rejects.toThrow()
      })
    },
    90_000,
  )
})
