/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF2–RF4), contra Postgres real: com a matriz "Retorno ao cliente" do tipo, o boleto aceito no modo
 * automático sai pelo modelo do módulo de notificação de cada canal. O WhatsApp em automático reserva um envio por
 * número do cliente (gatilho `automatic`, sem usuário) na transação da entrega, e o despacho depois do commit manda
 * cada número uma vez, mesmo com dois despachos ao mesmo tempo. Sem número, sem modelo ou sem nenhum número que
 * recebeu, o motivo fica na linha do tempo e o boleto cai para o e-mail do cliente (caixa do e-mail ligada).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeClientChannels,
  companyOccurrenceTypes,
  contractorMailMessages,
  deliveryClientContacts,
  deliveryClients,
  nfeDocuments,
  nfeParticipants,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
  whatsappEvolutionSettings,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByWhatsAppUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import {
  dispatchContractorReplyClientWhatsApp,
  type ContractorReplyClientWhatsAppSender,
} from '../../src/occurrence-conversation/infrastructure/contractor-reply-client-whatsapp-forward.support.js'
import {
  createDrizzleContractorReplyWhatsAppCompletion,
  createDrizzleContractorReplyWhatsAppReader,
  createDrizzleContractorReplyWhatsAppUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-whatsapp.repository.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import { seedNotificationTemplate } from '../fixtures/notification-template.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const CLIENT_TAX_ID = '12345678000188'
const OWNER_NUMBER = '+5511988887777'
const FINANCE_NUMBER = '+5516999998888'
const FINANCE_EMAIL = 'financeiro@mercado.example.test'
const ENVELOPE = { algorithm: 'A256GCM', ciphertext: 'c', keyId: 'k', nonce: 'n', version: 1 }
const TEMPLATE_KEY = 'boleto.cliente'
const WHATSAPP_BODY = 'Olá, {{razaoSocial}}! Segue o boleto da NF {{numeroNotaSemSerie}}.'
const EMAIL_SUBJECT = 'Boleto da NF {{numeroNotaSemSerie}}'
const EMAIL_BODY = 'Olá, {{razaoSocial}}. O boleto segue em anexo.'

type ChannelSetting = { readonly enabled: boolean; readonly sendMode: 'automatic' | 'manual' }

type Scenario = {
  readonly email?: ChannelSetting
  readonly evolution?: 'active' | 'none'
  readonly numbers?: readonly string[]
  readonly whatsapp?: ChannelSetting
  readonly whatsappTemplate?: boolean
}

const AUTOMATIC: ChannelSetting = { enabled: true, sendMode: 'automatic' }
const MANUAL: ChannelSetting = { enabled: true, sendMode: 'manual' }
const OFF: ChannelSetting = { enabled: false, sendMode: 'manual' }

async function typeIdOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (occurrence?.typeId === null || occurrence?.typeId === undefined) {
    throw new Error('EXPECTED_OCCURRENCE_TYPE')
  }
  return occurrence.typeId
}

/** O cliente da nota com cadastro, os números de WhatsApp e o e-mail do boleto. */
async function seedClient(
  database: TestDatabase,
  seeded: Seeded,
  numbers: readonly string[],
): Promise<string> {
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
  await database.db.insert(deliveryClientContacts).values(
    [
      ...numbers.map((address) => ({ address, channel: 'whatsapp' as const })),
      { address: FINANCE_EMAIL, channel: 'email' as const },
    ].map((contact) => ({
      ...contact,
      companyId,
      createdByKind: 'office' as const,
      createdByUserId: userId,
      label: '',
      purpose: 'boleto' as const,
      taxId: CLIENT_TAX_ID,
    })),
  )
  const [note] = await database.db
    .select({ number: nfeDocuments.number })
    .from(nfeDocuments)
    .where(eq(nfeDocuments.id, document.nfeDocumentId))
  return note?.number ?? ''
}

async function prepare(database: TestDatabase, scenario: Scenario = {}) {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const typeId = await typeIdOf(database, seeded)
  const noteNumber = await seedClient(
    database,
    seeded,
    scenario.numbers ?? [OWNER_NUMBER, FINANCE_NUMBER],
  )
  if ((scenario.evolution ?? 'active') === 'active') {
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
  }
  await database.db.insert(occurrenceConversations).values({
    companyId,
    driverUserId: userId,
    occurrenceId: seeded.occurrenceId,
    occurrenceKind: 'document',
    participant: 'driver',
  })
  await database.db
    .update(companyOccurrenceTypes)
    .set({ clientChannel: 'both', clientEmailType: 'boleto' })
    .where(eq(companyOccurrenceTypes.id, typeId))
  await seedNotificationTemplate(database, {
    body: EMAIL_BODY,
    companyId,
    key: TEMPLATE_KEY,
    subject: EMAIL_SUBJECT,
  })
  if (scenario.whatsappTemplate !== false) {
    await seedNotificationTemplate(database, {
      body: WHATSAPP_BODY,
      channel: 'whatsapp',
      companyId,
      key: TEMPLATE_KEY,
      subject: null,
    })
  }
  const settings = { email: scenario.email ?? OFF, whatsapp: scenario.whatsapp ?? AUTOMATIC }
  await database.db.insert(companyOccurrenceTypeClientChannels).values(
    (['email', 'whatsapp'] as const).map((channel) => ({
      channel,
      companyId,
      enabled: settings[channel].enabled,
      occurrenceTypeId: typeId,
      sendMode: settings[channel].sendMode,
      templateKey: TEMPLATE_KEY,
    })),
  )

  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'off',
    note: 'off',
    replyMode: 'forward_automatic',
  })
  const received = await receivePdfReply(database, { companyId, conversationId })
  return { ...received, companyId, noteNumber, seeded }
}

function fakeSender(behaviour: 'number_not_found' | 'ok' = 'ok') {
  const sends: { caption: string; number: string }[] = []
  const sender: ContractorReplyClientWhatsAppSender = {
    isConnected: async () => true,
    sendDocument: async ({ caption, number }) => {
      if (behaviour === 'number_not_found') {
        throw Object.assign(new Error('not on WhatsApp'), { failure: 'number_not_found' })
      }
      // Um respiro entre as chamadas: o despacho concorrente teria tempo de mandar de novo, se a trava falhasse.
      await new Promise((resolve) => setTimeout(resolve, 20))
      sends.push({ caption, number })
      return { providerMessageId: `wamid-${crypto.randomUUID()}` }
    },
  }
  return { sender, sends }
}

function dispatch(
  database: TestDatabase,
  companyId: string,
  sender: ContractorReplyClientWhatsAppSender,
) {
  return dispatchContractorReplyClientWhatsApp(
    {
      readAttachment: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      runner: database.db,
      sender,
      transaction: (operation) => database.db.transaction(operation),
    },
    { companyId },
  )
}

function deliveriesOf(
  database: TestDatabase,
  companyId: string,
  target: 'client_boleto_emails' | 'client_boleto_whatsapp',
) {
  return database.db
    .select({
      actorUserId: occurrenceContractorReplyDeliveries.actorUserId,
      address: occurrenceContractorReplyDeliveries.address,
      reason: occurrenceContractorReplyDeliveries.reason,
      status: occurrenceContractorReplyDeliveries.status,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, target),
      ),
    )
}

async function clientMailsOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      bodyText: contractorMailMessages.bodyText,
      subject: contractorMailMessages.subject,
      toAddresses: contractorMailMessages.toAddresses,
    })
    .from(contractorMailMessages)
    .innerJoin(
      occurrenceContractorReplyDeliveries,
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, contractorMailMessages.companyId),
        eq(occurrenceContractorReplyDeliveries.mailMessageId, contractorMailMessages.id),
      ),
    )
    .where(
      and(
        eq(contractorMailMessages.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

describe('spec 286 T3: o boleto aceito sai sozinho por canal, pelo modelo do módulo', () => {
  testWithPostgres(
    'WhatsApp em automático: um envio por número, pelo Sistema, com a legenda do modelo; o despacho manda uma vez',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, noteNumber, seeded } = await prepare(database)

        const reserved = await deliveriesOf(database, companyId, 'client_boleto_whatsapp')
        expect(reserved.map((row) => row.address).toSorted()).toEqual(
          [OWNER_NUMBER, FINANCE_NUMBER].toSorted(),
        )
        for (const row of reserved) {
          expect(row).toMatchObject({
            actorUserId: null,
            reason: null,
            status: 'queued',
            trigger: 'automatic',
          })
        }

        const { sender, sends } = fakeSender()
        expect(await dispatch(database, companyId, sender)).toEqual({
          failed: 0,
          fellBackToEmail: false,
          sent: 2,
        })
        expect(sends.map((send) => send.number).toSorted()).toEqual(
          [OWNER_NUMBER, FINANCE_NUMBER].toSorted(),
        )
        for (const send of sends) {
          expect(send.caption).toBe(`Olá, Mercado Beta! Segue o boleto da NF ${noteNumber}.`)
        }
        const sent = await deliveriesOf(database, companyId, 'client_boleto_whatsapp')
        expect(sent.map((row) => row.status)).toEqual(['sent', 'sent'])

        const notices = await database.db
          .select({
            bodyText: occurrenceConversationMessages.bodyText,
            systemNotice: occurrenceConversationMessages.systemNotice,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              eq(occurrenceConversationMessages.channel, 'whatsapp'),
            ),
          )
        const sentNotices = notices.filter(
          (notice) => notice.systemNotice?.kind === 'client_boleto_whatsapp_sent',
        )
        expect(sentNotices.every((notice) => notice.systemNotice?.actorKind === 'system')).toBe(
          true,
        )
        expect(sentNotices.map((notice) => notice.bodyText).toSorted()).toEqual(
          [
            `Boleto enviado por WhatsApp: ${OWNER_NUMBER}`,
            `Boleto enviado por WhatsApp: ${FINANCE_NUMBER}`,
          ].toSorted(),
        )

        expect(await dispatch(database, companyId, sender)).toEqual({
          failed: 0,
          fellBackToEmail: false,
          sent: 0,
        })
        expect(sends).toHaveLength(2)

        /** O botão depois, ao mesmo número, encontra a entrega automática (a mesma chave): nada sai de novo. */
        const manual = createForwardContractorReplyByWhatsAppUseCase({
          attachments: { read: async () => new Uint8Array([0x25]) },
          completion: createDrizzleContractorReplyWhatsAppCompletion(database.db),
          now: () => new Date(),
          sender,
          unitOfWork: createDrizzleContractorReplyWhatsAppUnitOfWork(database.db),
        })
        const replay = await manual.forward({
          actorUserId: seeded.company.userId,
          authorKind: 'office',
          companyId,
          contactIds: [],
          correlationId: `correlation-${crypto.randomUUID()}`,
          idempotencyKey: `key-${crypto.randomUUID()}`,
          number: OWNER_NUMBER,
          occurrenceId: seeded.occurrenceId,
          save: false,
        })
        expect(replay.results.map((result) => result.kind)).toEqual(['already_sent'])
        expect(sends).toHaveLength(2)

        const options = await createDrizzleContractorReplyWhatsAppReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(options?.deliveries.map((delivery) => delivery.trigger)).toEqual([
          'automatic',
          'automatic',
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois despachos ao mesmo tempo mandam cada número uma vez só (trava claimed_at)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await prepare(database)
        const { sender, sends } = fakeSender()

        const [first, second] = await Promise.all([
          dispatch(database, companyId, sender),
          dispatch(database, companyId, sender),
        ])
        expect(first.sent + second.sent).toBe(2)
        expect(sends.map((send) => send.number).toSorted()).toEqual(
          [OWNER_NUMBER, FINANCE_NUMBER].toSorted(),
        )
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'sem número no cadastro: "skipped / client_without_whatsapp" e o boleto cai para o e-mail ligado em manual',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, noteNumber } = await prepare(database, { email: MANUAL, numbers: [] })

        expect(await deliveriesOf(database, companyId, 'client_boleto_whatsapp')).toEqual([
          {
            actorUserId: null,
            address: null,
            reason: 'client_without_whatsapp',
            status: 'skipped',
            trigger: 'automatic',
          },
        ])
        expect(await deliveriesOf(database, companyId, 'client_boleto_emails')).toEqual([
          {
            actorUserId: null,
            address: FINANCE_EMAIL,
            reason: null,
            status: 'queued',
            trigger: 'automatic',
          },
        ])
        const [mail] = await clientMailsOf(database, companyId)
        expect(mail?.subject).toBe(`Boleto da NF ${noteNumber}`)
        expect(mail?.bodyText).toContain('Olá, Mercado Beta. O boleto segue em anexo.')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'nenhum número recebeu (sem WhatsApp): as entregas falham com o motivo e o boleto cai para o e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await prepare(database, { email: MANUAL })
        expect(await deliveriesOf(database, companyId, 'client_boleto_emails')).toEqual([])

        const { sender } = fakeSender('number_not_found')
        expect(await dispatch(database, companyId, sender)).toEqual({
          failed: 2,
          fellBackToEmail: true,
          sent: 0,
        })
        const whatsapp = await deliveriesOf(database, companyId, 'client_boleto_whatsapp')
        expect(whatsapp.map((row) => [row.status, row.reason])).toEqual([
          ['failed', 'whatsapp_number_not_found'],
          ['failed', 'whatsapp_number_not_found'],
        ])
        expect(await deliveriesOf(database, companyId, 'client_boleto_emails')).toEqual([
          {
            actorUserId: null,
            address: FINANCE_EMAIL,
            reason: null,
            status: 'queued',
            trigger: 'automatic',
          },
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'sem modelo de WhatsApp ou sem instância: o motivo fica na linha do tempo e o e-mail desligado não sai',
    async () => {
      for (const [scenario, reason] of [
        [{ whatsappTemplate: false }, 'template_missing'],
        [{ evolution: 'none' }, 'whatsapp_disconnected'],
      ] as const) {
        await withConversationDatabase(async (database) => {
          const { companyId } = await prepare(database, scenario)
          expect(await deliveriesOf(database, companyId, 'client_boleto_whatsapp')).toEqual([
            { actorUserId: null, address: null, reason, status: 'skipped', trigger: 'automatic' },
          ])
          expect(await deliveriesOf(database, companyId, 'client_boleto_emails')).toEqual([])
        })
      }
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'e-mail em automático sai pelo modelo do canal; WhatsApp manual ou desligado nunca sai sozinho',
    async () => {
      for (const whatsapp of [MANUAL, OFF]) {
        await withConversationDatabase(async (database) => {
          const { companyId, noteNumber } = await prepare(database, { email: AUTOMATIC, whatsapp })
          expect(await deliveriesOf(database, companyId, 'client_boleto_whatsapp')).toEqual([])
          const [mail] = await clientMailsOf(database, companyId)
          expect(mail?.toAddresses).toEqual([FINANCE_EMAIL])
          expect(mail?.subject).toBe(`Boleto da NF ${noteNumber}`)

          const [reply] = await database.db
            .select({ id: occurrenceContractorReplies.id })
            .from(occurrenceContractorReplies)
            .where(eq(occurrenceContractorReplies.companyId, companyId))
          expect(reply).toBeDefined()
        })
      }
    },
    TEST_TIMEOUT_MS,
  )
})
