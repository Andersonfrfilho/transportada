/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T2, contra Postgres real: o envio ao cliente (281 T5 pelo WhatsApp, 279 pelo e-mail) abre a conversa do
 * cliente na ocorrência e grava uma mensagem por entrega, com ator, canal, destino e estado (RF1); o envio repetido e
 * o reenvio reaproveitam a conversa (RF2); os estados avançam pela entrega e pelo provedor (RF5); a leitura só leva a
 * conversa a quem pode enviar ao cliente e nunca o destino em claro (RF7); sem cliente cadastrado, o envio segue e a
 * conversa não nasce (D3).
 *
 * Spec 283 T3: a resposta do WhatsApp que cita o envio, do número que o recebeu, entra na conversa do cliente (RF3); sem
 * citação vai para "não atribuídas", que oferece a conversa do cliente para vincular.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
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
  whatsappEvolutionSettings,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import type { ForwardContractorReplyToClientInput } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { createForwardContractorReplyByWhatsAppUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import type { ForwardContractorReplyByWhatsAppInput } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import { createDrizzleContractorReplyEmailUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import {
  createDrizzleContractorReplyWhatsAppCompletion,
  createDrizzleContractorReplyWhatsAppUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-whatsapp.repository.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { createEvolutionConversationInbound } from '../../src/occurrence-conversation/application/evolution-conversation-inbound.service.js'
import { createAssignUnassignedMessageUseCase } from '../../src/occurrence-conversation/application/occurrence-conversation-unassigned.use-case.js'
import { createDrizzleEvolutionConversationInboundRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-evolution-conversation-inbound.repository.js'
import {
  createDrizzleOccurrenceConversationUnassignedReader,
  createDrizzleOccurrenceConversationUnassignedUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-conversation-unassigned.repository.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { createSendClientReplyUseCase } from '../../src/occurrence-conversation/application/send-client-reply.use-case.js'
import { createDrizzleClientReplyRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-client-reply.repository.js'
import { applyProviderMessageStatus } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-message-status.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
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
const SAVED_NUMBER = '+5511988887777'
const OTHER_NUMBER = '+5516999998888'
const FINANCE_EMAIL = 'financeiro@mercado.example.test'
const ENVELOPE = { algorithm: 'A256GCM', ciphertext: 'c', keyId: 'k', nonce: 'n', version: 1 }

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
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Mercado Beta', taxId: CLIENT_TAX_ID })
  const contacts = await database.db
    .insert(deliveryClientContacts)
    .values(
      [
        { address: SAVED_NUMBER, channel: 'whatsapp' as const, label: 'dono' },
        { address: OTHER_NUMBER, channel: 'whatsapp' as const, label: 'gerente' },
        { address: FINANCE_EMAIL, channel: 'email' as const, label: 'financeiro' },
      ].map((contact) => ({
        ...contact,
        companyId,
        createdByKind: 'office' as const,
        createdByUserId: userId,
        purpose: 'boleto' as const,
        taxId: CLIENT_TAX_ID,
      })),
    )
    .returning({ address: deliveryClientContacts.address, id: deliveryClientContacts.id })
  const idOf = (address: string) => {
    const found = contacts.find((contact) => contact.address === address)
    if (found === undefined) throw new Error('EXPECTED_CONTACT')
    return found.id
  }
  return { emailId: idOf(FINANCE_EMAIL), otherId: idOf(OTHER_NUMBER), savedId: idOf(SAVED_NUMBER) }
}

async function prepare(database: TestDatabase, options: { readonly withClient?: boolean } = {}) {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  await receivePdfReply(database, { companyId, conversationId })
  const contacts = options.withClient === false ? null : await seedClient(database, seeded)
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({ clientChannel: 'both', clientEmailType: 'boleto' })
    .where(eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''))
  await database.db.insert(whatsappEvolutionSettings).values({
    baseUrl: 'https://evolution.example.test',
    companyId,
    connectionState: 'open',
    dailyCap: 50,
    instanceName: 'empresa-teste',
    riskAcknowledgedAt: new Date(),
    riskAcknowledgedBy: userId,
    secretEnvelope: ENVELOPE,
    status: 'active',
  })
  /** O motorista da ocorrência é o mesmo usuário do cenário: o envio sai como "pelo app do motorista". */
  await database.db.insert(occurrenceConversations).values({
    companyId,
    driverUserId: userId,
    occurrenceId: seeded.occurrenceId,
    occurrenceKind: 'document',
    participant: 'driver',
  })

  const providerIds: string[] = []
  const failNumbers = new Set<string>()
  const whatsapp = createForwardContractorReplyByWhatsAppUseCase({
    attachments: { read: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
    completion: createDrizzleContractorReplyWhatsAppCompletion(database.db),
    now: () => new Date(),
    sender: {
      isConnected: async () => true,
      sendDocument: async ({ number }) => {
        if (failNumbers.has(number)) throw new Error('EVOLUTION_DOWN')
        const providerMessageId = `wamid-${crypto.randomUUID()}`
        providerIds.push(providerMessageId)
        return { providerMessageId }
      },
    },
    unitOfWork: createDrizzleContractorReplyWhatsAppUnitOfWork(database.db),
  })
  const email = createForwardContractorReplyByEmailUseCase({
    unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
  })
  return { companyId, contacts, email, failNumbers, providerIds, seeded, whatsapp }
}

function whatsappInput(
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

function emailInput(
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

async function clientConversations(database: TestDatabase, companyId: string) {
  return database.db
    .select({ clientTaxId: occurrenceConversations.clientTaxId, id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, companyId),
        eq(occurrenceConversations.participant, 'client'),
      ),
    )
}

async function clientMessages(database: TestDatabase, conversationId: string) {
  return database.db
    .select({
      authorUserId: occurrenceConversationMessages.authorUserId,
      automatic: occurrenceConversationMessages.automatic,
      bodyText: occurrenceConversationMessages.bodyText,
      channel: occurrenceConversationMessages.channel,
      clientDeliveryId: occurrenceConversationMessages.clientDeliveryId,
      providerMessageId: occurrenceConversationMessages.providerMessageId,
      recipientAddress: occurrenceConversationMessages.recipientAddress,
      status: occurrenceConversationMessages.status,
      statusTimes: occurrenceConversationMessages.statusTimes,
    })
    .from(occurrenceConversationMessages)
    .where(eq(occurrenceConversationMessages.conversationId, conversationId))
}

describe('a conversa do cliente nasce no envio (spec 283 T2)', () => {
  testWithPostgres(
    'WhatsApp: uma conversa, uma mensagem por número, e o repetido não duplica (RF1, RF2)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, providerIds, seeded, whatsapp } = await prepare(database)

        await whatsapp.forward(
          whatsappInput(seeded, { contactIds: [contacts?.savedId ?? '', contacts?.otherId ?? ''] }),
        )
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))

        const conversations = await clientConversations(database, companyId)
        expect(conversations).toEqual([{ clientTaxId: CLIENT_TAX_ID, id: expect.any(String) }])
        const messages = await clientMessages(database, conversations[0]?.id ?? '')
        expect(messages).toHaveLength(2)
        expect(messages.map((message) => message.recipientAddress).toSorted()).toEqual([
          SAVED_NUMBER,
          OTHER_NUMBER,
        ])
        for (const message of messages) {
          expect(message).toMatchObject({
            authorUserId: seeded.company.userId,
            automatic: false,
            channel: 'whatsapp',
            providerMessageId: null,
            status: 'sent',
          })
          expect(Object.keys(message.statusTimes).toSorted()).toEqual(['queued', 'sent'])
        }
        expect(providerIds).toHaveLength(2)

        /** RF2: um envio por entrega — repetir o fechamento da entrega não grava outra mensagem. */
        await database.db
          .update(occurrenceContractorReplyDeliveries)
          .set({ status: 'sent' })
          .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId))
        expect(await clientMessages(database, conversations[0]?.id ?? '')).toHaveLength(2)
      })
    },
    90_000,
  )

  testWithPostgres(
    'os estados acompanham a entrega e o provedor, e a faixa mostra cada número (RF5, D4)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, failNumbers, providerIds, seeded, whatsapp } =
          await prepare(database)
        failNumbers.add(OTHER_NUMBER)
        await whatsapp.forward(
          whatsappInput(seeded, { contactIds: [contacts?.savedId ?? '', contacts?.otherId ?? ''] }),
        )

        const at = new Date()
        for (const incoming of ['delivered', 'read'] as const) {
          await applyProviderMessageStatus(database.db, {
            at,
            channel: 'whatsapp',
            companyId,
            incoming,
            providerMessageId: providerIds[0] ?? '',
          })
        }

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          includeClient: true,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const client = view?.conversations.find((entry) => entry.participant === 'client')
        expect(client?.client).toMatchObject({
          channels: [
            { addressMasked: '+55 ••••7777', channel: 'whatsapp', state: 'read' },
            { addressMasked: '+55 ••••8888', channel: 'whatsapp', state: 'failed' },
          ],
          name: 'Mercado Beta',
          taxIdMasked: '**.***.780/****-**',
        })
        expect(client?.messages.map((message) => message.status).toSorted()).toEqual([
          'failed',
          'read',
        ])
        expect(client?.messages[0]?.clientDelivery).toMatchObject({
          actorKind: 'driver',
          recipientMasked: expect.stringMatching(/^\+55 ••••\d{4}$/u),
        })
        /** O aviso da conversa do motorista mostra o número por inteiro (281 T5); a do cliente, nunca. */
        expect(JSON.stringify(client)).not.toContain('99999')
        expect(JSON.stringify(client)).not.toContain('988887777')
      })
    },
    90_000,
  )

  testWithPostgres(
    'e-mail: a mesma conversa ganha o envio, com o texto do e-mail, e o Resend avança o estado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, email, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))
        await email.forwardToClient(emailInput(seeded, { emailIds: [contacts?.emailId ?? ''] }))

        const [conversation] = await clientConversations(database, companyId)
        const messages = await clientMessages(database, conversation?.id ?? '')
        const mail = messages.find((message) => message.channel === 'email')
        expect(messages).toHaveLength(2)
        expect(mail).toMatchObject({
          recipientAddress: FINANCE_EMAIL,
          status: 'queued',
        })
        expect(mail?.bodyText.length).toBeGreaterThan(0)

        /** O que o worker faz quando o e-mail sai: a entrega fecha `sent` e o Resend dá o id. */
        const [delivery] = await database.db
          .select({
            id: occurrenceContractorReplyDeliveries.id,
            mailMessageId: occurrenceContractorReplyDeliveries.mailMessageId,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.id, mail?.clientDeliveryId ?? ''))
        await database.db
          .update(contractorMailMessages)
          .set({ deliveryStatus: 'sent', providerEmailId: 're_client_mail' })
          .where(eq(contractorMailMessages.id, delivery?.mailMessageId ?? ''))
        await database.db
          .update(occurrenceContractorReplyDeliveries)
          .set({ sentAt: new Date(), status: 'sent' })
          .where(eq(occurrenceContractorReplyDeliveries.id, delivery?.id ?? ''))
        await applyProviderMessageStatus(database.db, {
          at: new Date(),
          channel: 'email',
          companyId,
          incoming: 'delivered',
          providerMessageId: 're_client_mail',
        })

        const after = await clientMessages(database, conversation?.id ?? '')
        expect(after.find((message) => message.channel === 'email')?.status).toBe('delivered')
        const view = await findOccurrenceConversations(database.db, {
          companyId,
          includeClient: true,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const client = view?.conversations.find((entry) => entry.participant === 'client')
        expect(client?.client?.channels.map((channel) => [channel.channel, channel.state])).toEqual(
          [
            ['whatsapp', 'sent'],
            ['email', 'delivered'],
          ],
        )
        expect(JSON.stringify(client?.client)).not.toContain('financeiro@')
      })
    },
    90_000,
  )

  testWithPostgres(
    'sem a permissão de enviar ao cliente a conversa não sai; sem envio, nada muda (RF7, D3)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        const read = (includeClient: boolean) =>
          findOccurrenceConversations(database.db, {
            companyId,
            includeClient,
            occurrenceId: seeded.occurrenceId,
            userId: seeded.company.userId,
          })
        expect(
          (await read(true))?.conversations.some((entry) => entry.participant === 'client'),
        ).toBe(false)

        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))
        expect(
          (await read(false))?.conversations.map((entry) => entry.participant).toSorted(),
        ).toEqual(['contractor', 'driver'])
        expect(
          (await read(true))?.conversations.map((entry) => entry.participant).toSorted(),
        ).toEqual(['client', 'contractor', 'driver'])
      })
    },
    90_000,
  )

  testWithPostgres(
    'contato removido: a conversa fica e o canal some da faixa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(
          whatsappInput(seeded, { contactIds: [contacts?.savedId ?? '', contacts?.otherId ?? ''] }),
        )
        await database.db
          .delete(deliveryClientContacts)
          .where(eq(deliveryClientContacts.id, contacts?.otherId ?? ''))
        const view = await findOccurrenceConversations(database.db, {
          companyId,
          includeClient: true,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const client = view?.conversations.find((entry) => entry.participant === 'client')
        expect(client?.messages).toHaveLength(2)
        expect(client?.client?.channels.map((channel) => channel.addressMasked)).toEqual([
          '+55 ••••7777',
        ])
      })
    },
    90_000,
  )

  testWithPostgres(
    'sem cliente cadastrado o envio segue e a conversa não nasce',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, providerIds, seeded, whatsapp } = await prepare(database, {
          withClient: false,
        })
        const outcome = await whatsapp.forward(whatsappInput(seeded, { number: '16999998888' }))
        expect(outcome.results[0]?.kind).toBe('sent')
        expect(providerIds).toHaveLength(1)
        expect(await clientConversations(database, companyId)).toEqual([])
      })
    },
    90_000,
  )
})

function createInbound(database: TestDatabase) {
  const silent = () => undefined
  return createEvolutionConversationInbound({
    applyStatus: async () => undefined,
    clock: () => new Date(),
    inbound: createDrizzleEvolutionConversationInboundRepository(database.db),
    logger: { error: silent, info: silent, warn: silent } as unknown as ApiLogger,
    rateLimiter: createRateLimiter(),
  })
}

describe('a resposta do cliente entra na conversa dele (spec 283 T3)', () => {
  testWithPostgres(
    'citando o envio, do número que recebeu, entra na conversa do cliente e marca "respondeu" (RF3)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, providerIds, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))

        const outcome = await createInbound(database).receiveMessage({
          companyId,
          message: {
            /** O mesmo celular sem o nono dígito: a chave do WhatsApp casa as duas grafias. */
            from: '551188887777',
            providerMessageId: 'EVO-IN-283',
            replyToProviderMessageId: providerIds[0] ?? '',
            text: 'Recebi, obrigado',
          },
        })
        expect(outcome).toBe('conversation')

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          includeClient: true,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const client = view?.conversations.find((entry) => entry.participant === 'client')
        const driver = view?.conversations.find((entry) => entry.participant === 'driver')
        expect(client?.messages.at(-1)).toMatchObject({
          author: { addressMasked: '+55 ••••7777', kind: 'client' },
          bodyText: 'Recebi, obrigado',
          direction: 'inbound',
        })
        expect(client?.unreadCount).toBe(1)
        expect(client?.client?.channels).toMatchObject([
          { addressMasked: '+55 ••••7777', state: 'replied' },
        ])
        expect(driver?.messages.some((message) => message.direction === 'inbound')).toBe(false)
      })
    },
    90_000,
  )

  testWithPostgres(
    'sem citação vai para não atribuídas, com a conversa do cliente para vincular',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))

        const outcome = await createInbound(database).receiveMessage({
          companyId,
          message: {
            from: '5511988887777',
            providerMessageId: 'EVO-IN-283-B',
            replyToProviderMessageId: null,
            text: 'Qual o vencimento?',
          },
        })
        expect(outcome).toBe('unassigned')

        const [conversation] = await clientConversations(database, companyId)
        const pending = await createDrizzleOccurrenceConversationUnassignedReader(
          database.db,
        ).listPending({ companyId })
        expect(pending).toHaveLength(1)
        expect(pending[0]?.candidates).toMatchObject([
          {
            contractorName: 'Mercado Beta',
            conversationId: conversation?.id,
            occurrenceId: seeded.occurrenceId,
            occurrenceKind: 'document',
            participant: 'client',
          },
        ])

        const assigned = await createAssignUnassignedMessageUseCase({
          clock: () => new Date(),
          unitOfWork: createDrizzleOccurrenceConversationUnassignedUnitOfWork(database.db),
        }).assign({
          companyId,
          conversationId: conversation?.id ?? '',
          unassignedId: pending[0]?.id ?? '',
          userId: seeded.company.userId,
        })
        expect(assigned.conversationId).toBe(conversation?.id ?? '')
        const messages = await database.db
          .select({
            bodyText: occurrenceConversationMessages.bodyText,
            direction: occurrenceConversationMessages.direction,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, assigned.messageId))
        expect(messages).toEqual([{ bodyText: 'Qual o vencimento?', direction: 'inbound' }])
      })
    },
    90_000,
  )

  testWithPostgres(
    'número que nunca recebeu nem é contato do cliente não tem a conversa do cliente como candidata',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))
        await createInbound(database).receiveMessage({
          companyId,
          message: {
            from: '5521977776666',
            providerMessageId: 'EVO-IN-283-C',
            replyToProviderMessageId: null,
            text: 'oi',
          },
        })
        const pending = await createDrizzleOccurrenceConversationUnassignedReader(
          database.db,
        ).listPending({ companyId })
        expect(pending).toHaveLength(1)
        expect(pending[0]?.candidates).toEqual([])
      })
    },
    90_000,
  )
})

function createClientReply(database: TestDatabase) {
  const sent: { body: string; number: string }[] = []
  const silent = () => undefined
  const useCase = createSendClientReplyUseCase({
    logger: { warn: silent },
    repository: createDrizzleClientReplyRepository(database.db),
    sender: {
      isConnected: async () => true,
      sendText: async ({ body, number }) => {
        sent.push({ body, number })
        return { providerMessageId: `wamid-reply-${sent.length}` }
      },
    },
  })
  return { sent, useCase }
}

describe('o painel responde ao cliente (spec 283 T5)', () => {
  testWithPostgres(
    'pelo alvo da faixa: confirma no primeiro envio, grava na conversa do cliente e não repete a chave (D6)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))
        const read = () =>
          findOccurrenceConversations(database.db, {
            companyId,
            includeClient: true,
            occurrenceId: seeded.occurrenceId,
            userId: seeded.company.userId,
          }).then((view) => view?.conversations.find((entry) => entry.participant === 'client'))

        const before = await read()
        const target = before?.client?.channels[0]?.replyTarget
        expect(target).toMatchObject({ confirmed: false })
        const { sent, useCase } = createClientReply(database)
        const input = {
          actorUserId: seeded.company.userId,
          bodyText: 'Bom dia, o boleto segue acima.',
          companyId,
          confirmNumber: false,
          correlationId: 'correlation-283-t5',
          idempotencyKey: 'client-reply-283-0001',
          occurrenceId: seeded.occurrenceId,
          replyTargetId: target?.id ?? '',
        }

        await expect(useCase.send(input)).rejects.toMatchObject({
          code: 'OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED',
        })
        expect(sent).toEqual([])

        const result = await useCase.send({ ...input, confirmNumber: true })
        expect(result).toMatchObject({ replayed: false, status: 'sent' })
        expect(await useCase.send({ ...input, confirmNumber: true })).toEqual({
          ...result,
          replayed: true,
        })
        expect(sent).toEqual([{ body: input.bodyText, number: SAVED_NUMBER }])

        const after = await read()
        expect(after?.messages.at(-1)).toMatchObject({
          author: { kind: 'operation' },
          bodyText: input.bodyText,
          channel: 'whatsapp',
          direction: 'outbound',
          id: result.messageId,
          recipientMasked: '+55 ••••7777',
          status: 'sent',
        })
        expect(after?.messages.at(-1)?.clientDelivery).toBeUndefined()
        expect(after?.client?.channels[0]?.replyTarget).toEqual({
          confirmed: true,
          id: target?.id ?? '',
        })
        expect(JSON.stringify(after)).not.toContain('988887777')

        /** Já confirmado: o segundo envio dispensa `confirmNumber`. */
        await useCase.send({ ...input, idempotencyKey: 'client-reply-283-0002' })
        expect(sent).toHaveLength(2)
      })
    },
    90_000,
  )

  testWithPostgres(
    'a resposta do cliente citando a mensagem do painel entra na conversa dele; o lido avança pelo provedor',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, contacts, seeded, whatsapp } = await prepare(database)
        await whatsapp.forward(whatsappInput(seeded, { contactIds: [contacts?.savedId ?? ''] }))
        const [conversation] = await clientConversations(database, companyId)
        const view = await findOccurrenceConversations(database.db, {
          companyId,
          includeClient: true,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const target = view?.conversations.find((entry) => entry.participant === 'client')?.client
          ?.channels[0]?.replyTarget
        const { useCase } = createClientReply(database)
        await useCase.send({
          actorUserId: seeded.company.userId,
          bodyText: 'Conseguiu abrir o boleto?',
          companyId,
          confirmNumber: true,
          correlationId: 'correlation-283-t5b',
          idempotencyKey: 'client-reply-283-0003',
          occurrenceId: seeded.occurrenceId,
          replyTargetId: target?.id ?? '',
        })

        await applyProviderMessageStatus(database.db, {
          at: new Date(),
          channel: 'whatsapp',
          companyId,
          incoming: 'read',
          providerMessageId: 'wamid-reply-1',
        })
        const outcome = await createInbound(database).receiveMessage({
          companyId,
          message: {
            from: '5511988887777',
            providerMessageId: 'EVO-IN-283-T5',
            replyToProviderMessageId: 'wamid-reply-1',
            text: 'Consegui sim',
          },
        })
        expect(outcome).toBe('conversation')

        const messages = await clientMessages(database, conversation?.id ?? '')
        expect(
          messages.find((message) => message.providerMessageId === 'wamid-reply-1'),
        ).toMatchObject({
          status: 'read',
        })
        expect(messages.some((message) => message.bodyText === 'Consegui sim')).toBe(true)
      })
    },
    90_000,
  )
})
