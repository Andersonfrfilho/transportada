/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4, D6), contra Postgres real:
 * - quem recebeu o boleto pelo Evolution responde citando o aviso e a mensagem entra na conversa, uma
 *   vez só (a reentrega não duplica), pelas duas grafias do nono dígito; outro número citando o mesmo
 *   aviso vai para "não atribuídas";
 * - as confirmações do Evolution levam o aviso de `sent` a `read`, e um `delivered` atrasado não volta;
 * - o webhook acha a empresa pelo `webhookId`, guarda o segredo, marca o registro com auditoria e
 *   grava a última entrega e o estado da conexão; mudar endereço, instância ou chave desmarca o
 *   registro para o próximo QR apontar de novo.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
  occurrenceConversationUnassigned,
} from '../../src/database/database.schema.js'
import { whatsappEvolutionSettings } from '../../src/database/whatsapp-evolution.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { createEvolutionConversationInbound } from '../../src/occurrence-conversation/application/evolution-conversation-inbound.service.js'
import { createDrizzleEvolutionConversationInboundRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-evolution-conversation-inbound.repository.js'
import { applyProviderMessageStatus } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-message-status.repository.js'
import { DrizzleWhatsAppEvolutionRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-evolution.repository.js'
import { createDrizzleWhatsAppEvolutionWebhookRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-evolution-webhook.repository.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_PHONE = '+5516999998888'
const CLIENT_PHONE_WITHOUT_NINTH = '551699998888'
const OTHER_PHONE = '5511977776666'
const OUTBOUND_ID = 'EVO-OUT-1'
const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }
const ENVELOPE = {
  algorithm: 'A256GCM',
  ciphertext: 'cifrado',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1,
} as const

/**
 * O que a T5 grava quando o boleto sai pelo Evolution: a entrega com o número e, na conversa, o aviso
 * com o id do Evolution e a entrega no `system_notice`.
 */
async function seedBoletoSentByWhatsApp(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  const { attachmentId } = await receivePdfReply(database, { companyId, conversationId })
  const [reply] = await database.db
    .select({ id: occurrenceContractorReplies.id })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  const [delivery] = await database.db
    .insert(occurrenceContractorReplyDeliveries)
    .values({
      actorUserId: userId,
      address: CLIENT_PHONE,
      attachmentId,
      companyId,
      idempotencyKey: `whatsapp-${crypto.randomUUID()}`,
      replyId: reply?.id ?? '',
      sentAt: new Date(),
      status: 'sent',
      target: 'client_boleto_whatsapp',
      trigger: 'operator',
    })
    .returning({ id: occurrenceContractorReplyDeliveries.id })
  const [notice] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      automatic: true,
      bodyText: 'Boleto enviado por WhatsApp: +55 16 9****-8888',
      channel: 'whatsapp',
      companyId,
      conversationId,
      direction: 'outbound',
      providerMessageId: OUTBOUND_ID,
      status: 'sent',
      statusTimes: { sent: new Date().toISOString() },
      systemNotice: {
        actorKind: 'office',
        actorName: 'Operador',
        deliveryId: delivery?.id ?? '',
        kind: 'client_boleto_whatsapp_sent',
      },
    })
    .returning({ id: occurrenceConversationMessages.id })
  return { companyId, conversationId, noticeId: notice?.id ?? '', userId }
}

function createInbound(database: TestDatabase) {
  return createEvolutionConversationInbound({
    applyStatus: (input) =>
      applyProviderMessageStatus(database.db, { ...input, channel: 'whatsapp' }),
    clock: () => new Date(),
    inbound: createDrizzleEvolutionConversationInboundRepository(database.db),
    logger: SILENT_LOGGER,
    rateLimiter: createRateLimiter(),
  })
}

describe('o webhook do Evolution contra Postgres (spec 281 T6)', () => {
  testWithPostgres(
    'a resposta de quem recebeu o boleto entra no fio uma vez só; outro número fica para o operador',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, conversationId } = await seedBoletoSentByWhatsApp(database)
        const inbound = createInbound(database)
        const reply = {
          from: CLIENT_PHONE_WITHOUT_NINTH,
          providerMessageId: 'EVO-IN-1',
          replyToProviderMessageId: OUTBOUND_ID,
          text: 'Recebi, obrigado',
        }

        expect(await inbound.receiveMessage({ companyId, message: reply })).toBe('conversation')
        expect(await inbound.receiveMessage({ companyId, message: reply })).toBe('conversation')
        expect(
          await inbound.receiveMessage({
            companyId,
            message: { ...reply, from: OTHER_PHONE, providerMessageId: 'EVO-IN-2' },
          }),
        ).toBe('unassigned')

        const inThread = await database.db
          .select({
            bodyText: occurrenceConversationMessages.bodyText,
            conversationId: occurrenceConversationMessages.conversationId,
            senderAddress: occurrenceConversationMessages.senderAddress,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              eq(occurrenceConversationMessages.providerMessageId, 'EVO-IN-1'),
            ),
          )
        expect(inThread).toEqual([
          {
            bodyText: 'Recebi, obrigado',
            conversationId,
            senderAddress: CLIENT_PHONE_WITHOUT_NINTH,
          },
        ])
        const unassigned = await database.db
          .select({
            providerMessageId: occurrenceConversationUnassigned.providerMessageId,
            senderAddress: occurrenceConversationUnassigned.senderAddress,
          })
          .from(occurrenceConversationUnassigned)
          .where(eq(occurrenceConversationUnassigned.companyId, companyId))
        expect(unassigned).toEqual([{ providerMessageId: 'EVO-IN-2', senderAddress: OTHER_PHONE }])
      })
    },
  )

  testWithPostgres('as confirmações levam o aviso a lida, e o atrasado não volta', async () => {
    await withConversationDatabase(async (database) => {
      const { companyId, noticeId } = await seedBoletoSentByWhatsApp(database)
      const inbound = createInbound(database)

      for (const status of ['delivered', 'read', 'delivered'] as const) {
        await inbound.receiveStatus({ companyId, providerMessageId: OUTBOUND_ID, status })
      }
      // Outra empresa com o mesmo id do provedor não acha a mensagem.
      await inbound.receiveStatus({
        companyId: crypto.randomUUID(),
        providerMessageId: OUTBOUND_ID,
        status: 'failed',
      })

      const [notice] = await database.db
        .select({
          status: occurrenceConversationMessages.status,
          statusTimes: occurrenceConversationMessages.statusTimes,
        })
        .from(occurrenceConversationMessages)
        .where(eq(occurrenceConversationMessages.id, noticeId))
      expect(notice?.status).toBe('read')
      expect(Object.keys(notice?.statusTimes ?? {}).sort()).toEqual(['delivered', 'read', 'sent'])
    })
  })

  testWithPostgres(
    'o webhook acha a empresa pelo id, guarda o segredo e o registro, e a troca de instância o desfaz',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId } = seeded.company
        const [settings] = await database.db
          .insert(whatsappEvolutionSettings)
          .values({
            baseUrl: 'https://evolution.exemplo.com',
            companyId,
            instanceName: 'transportada',
            riskAcknowledgedAt: new Date(),
            secretEnvelope: ENVELOPE,
            status: 'active',
          })
          .returning({
            id: whatsappEvolutionSettings.id,
            webhookId: whatsappEvolutionSettings.webhookId,
          })
        const settingsId = settings?.id ?? ''
        const webhookId = settings?.webhookId ?? ''
        const repository = createDrizzleWhatsAppEvolutionWebhookRepository(database.db)

        expect(await repository.findByWebhookId({ webhookId: crypto.randomUUID() })).toBeNull()
        expect(await repository.findByWebhookId({ webhookId })).toEqual({
          companyId,
          instanceName: 'transportada',
          settingsId,
          status: 'active',
          webhookEnvelope: null,
        })

        await repository.storeSecret({
          companyId,
          envelope: { ...ENVELOPE, ciphertext: 'segredo-cifrado' },
          settingsId,
        })
        const registeredAt = await repository.markRegistered({
          audit: {
            action: 'whatsapp-evolution.webhook.registered',
            actorUserId: userId,
            correlationId: 'correlation-1',
          },
          companyId,
          rotated: true,
          settingsId,
        })
        await repository.recordDelivery({ companyId, connectionState: 'open' })

        const registration = await repository.findRegistration({ companyId })
        expect(registration?.webhookEnvelope?.ciphertext).toBe('segredo-cifrado')
        expect(registration?.registeredAt?.toISOString()).toBe(registeredAt.toISOString())
        const [row] = await database.db
          .select({
            connectionState: whatsappEvolutionSettings.connectionState,
            lastWebhookAt: whatsappEvolutionSettings.lastWebhookAt,
          })
          .from(whatsappEvolutionSettings)
          .where(eq(whatsappEvolutionSettings.id, settingsId))
        expect(row?.connectionState).toBe('open')
        expect(row?.lastWebhookAt).not.toBeNull()
        const audits = await database.db
          .select({ afterSnapshot: auditLogs.afterSnapshot })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, companyId),
              eq(auditLogs.action, 'whatsapp-evolution.webhook.registered'),
            ),
          )
        expect(audits).toEqual([{ afterSnapshot: { rotated: true } }])

        // A T4 grava instância nova: o webhook de lá ainda não aponta para nós.
        await new DrizzleWhatsAppEvolutionRepository(database.db).save({
          audit: {
            action: 'whatsapp-evolution.settings.saved',
            actorUserId: userId,
            afterSnapshot: { changedFields: ['instanceName'], id: settingsId },
            beforeSnapshot: null,
            correlationId: 'correlation-2',
          },
          baseUrl: 'https://evolution.exemplo.com',
          companyId,
          dailyCap: 50,
          defaultProvider: 'meta',
          instanceName: 'outra',
          minIntervalSeconds: 15,
          resetConnection: true,
          // Com o aviso no VALUES: regravar `active` sem ele esbarra no CHECK antes do ON CONFLICT (defeito avisado à T4).
          riskAcknowledgedBy: userId,
          secretEnvelope: undefined,
          settingsId,
          status: 'active',
        })
        const after = await repository.findRegistration({ companyId })
        expect(after?.registeredAt).toBeNull()
        expect(after?.webhookEnvelope?.ciphertext).toBe('segredo-cifrado')
        expect(after?.webhookId).toBe(webhookId)
      })
    },
  )
})
