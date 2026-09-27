/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): a conversa com o motorista pelo app. O operador escreve, a mensagem nasce na
 * fila (o app confirma entrega e leitura, T604) e vira aviso na caixa do motorista — `dedupeKey` =
 * id da mensagem, e o reenvio da mesma chave não avisa de novo. O motorista lê e responde só a
 * conversa **dele**, de ocorrência de viagem **dele**. A conversa com a contratante nunca aparece.
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { initialOutboundStatus } from '../domain/message-status.policy.js'
import {
  OccurrenceConversationDriverChangedError,
  OccurrenceConversationDriverUnknownError,
  OccurrenceConversationIdempotencyKeyReusedError,
} from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentStoragePort,
  ConversationUploadRepositoryPort,
  ConversationUploadTarget,
} from './conversation-attachment.port.js'
import {
  attachConversationUploads,
  normalizeConversationMessageBody,
  requestConversationUpload,
  signConversationAttachments,
} from './conversation-attachment.service.js'
import type {
  DriverConversationNotifierPort,
  DriverConversationTransactionPort,
  DriverConversationUnitOfWorkPort,
} from './driver-conversation.port.js'

export const SEND_DRIVER_APP_MESSAGE_OPERATION = 'occurrence-conversation.app.send'
export const REPLY_DRIVER_APP_MESSAGE_OPERATION = 'occurrence-conversation.app.reply'

const ENCODER = new TextEncoder()

/** A mesma chave com outro pedido é 409; com o mesmo, devolve o que foi gravado. */
async function replayOrRun<TResult>(input: {
  readonly companyId: string
  readonly fields: readonly string[]
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly idempotencyKey: string
  readonly operation: string
  readonly run: () => Promise<TResult>
  readonly transaction: DriverConversationTransactionPort
}): Promise<{ readonly replayed: boolean; readonly result: TResult }> {
  const fingerprint = await input.fingerprintService.create({
    fields: input.fields.map((value) => ENCODER.encode(value)),
    operation: input.operation,
  })
  const replay = await input.transaction.findIdempotency(input)
  if (replay !== null) {
    if (replay.fingerprint !== fingerprint)
      throw new OccurrenceConversationIdempotencyKeyReusedError()
    return { replayed: true, result: replay.response as TResult }
  }
  const result = await input.run()
  await input.transaction.saveIdempotency({ ...input, fingerprint, response: result })
  return { replayed: false, result }
}

export type SendDriverAppMessageResult = {
  readonly conversationId: string
  readonly conversationMessageId: string
}

export function createSendDriverAppMessageUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly notifier: DriverConversationNotifierPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    async send(input: {
      readonly actorUserId: string
      /** Spec 183 T702a (RF10): pedidos de upload deste operador para esta conversa. */
      readonly attachmentIds?: readonly string[]
      readonly bodyText: string
      readonly companyId: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }): Promise<SendDriverAppMessageResult> {
      const attachmentIds = input.attachmentIds ?? []
      const bodyText = normalizeConversationMessageBody(input.bodyText, attachmentIds)
      const now = dependencies.clock()
      const outcome = await dependencies.unitOfWork.execute(async (transaction) => {
        const target = await transaction.findDriverTarget(input)
        if (target === null) throw new TripOccurrenceNotFoundError()
        const { driverUserId } = target
        if (driverUserId === null) throw new OccurrenceConversationDriverUnknownError()

        const executed = await replayOrRun({
          companyId: input.companyId,
          fields: [input.companyId, input.occurrenceId, bodyText, attachmentIds.join(',')],
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: SEND_DRIVER_APP_MESSAGE_OPERATION,
          run: async (): Promise<SendDriverAppMessageResult> => {
            /** T903 (C1): a mensagem vai ao motorista principal de agora — a conversa passa a ele. */
            const conversation = await transaction.findOrCreateDriverConversation({
              companyId: input.companyId,
              driverUserId,
              occurrenceId: input.occurrenceId,
              occurrenceKind: target.occurrenceKind,
              retarget: true,
            })
            const status = initialOutboundStatus('app')
            const message = await transaction.insertMessage({
              authorUserId: input.actorUserId,
              bodyText,
              companyId: input.companyId,
              conversationId: conversation.id,
              createdAt: now,
              direction: 'outbound',
              driverUserId: null,
              idempotencyKey: input.idempotencyKey,
              status,
              statusTimes: { [status]: now.toISOString() },
            })
            await attachConversationUploads({
              messageId: message.id,
              now,
              storage: dependencies.storage,
              target: {
                channel: 'app',
                companyId: input.companyId,
                occurrenceId: input.occurrenceId,
                occurrenceKind: target.occurrenceKind,
                participant: 'driver',
                requestedByUserId: input.actorUserId,
              },
              transaction: transaction.attachments,
              uploadIds: attachmentIds,
            })
            return { conversationId: conversation.id, conversationMessageId: message.id }
          },
          transaction,
        })
        return { ...executed, driverUserId, occurrenceLabel: target.occurrenceLabel }
      })

      /** Depois da transação, e só na primeira vez: o aviso é conveniência, nunca desfaz a mensagem. */
      if (!outcome.replayed) {
        try {
          await dependencies.notifier.notify({
            companyId: input.companyId,
            dedupeKey: outcome.result.conversationMessageId,
            occurrenceLabel: outcome.occurrenceLabel,
            recipientUserId: outcome.driverUserId,
          })
        } catch {
          // O notificador registra a própria falha; a mensagem já está na conversa.
        }
      }
      return outcome.result
    },
  }
}

type MyOccurrenceInput = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly occurrenceId: string
}

export function createListMyOccurrenceConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly storage: Pick<ConversationAttachmentStoragePort, 'createSignedDownload'>
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    list: (input: MyOccurrenceInput) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const occurrence = await transaction.findMyOccurrence(input)
        if (occurrence === null) throw new TripOccurrenceNotFoundError()
        /** T604 (RF14): o app baixou — entregue, antes de ler, para a resposta já vir com ele. */
        await transaction.applyDriverStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          incoming: 'delivered',
          occurrenceId: input.occurrenceId,
        })
        const messages = await transaction.listDriverMessages({
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          occurrenceId: input.occurrenceId,
          occurrenceKind: occurrence.occurrenceKind,
        })
        /** T702a (RF10): os anexos com URL temporária, assinada na leitura. */
        const attachments = await signConversationAttachments(
          dependencies.storage,
          await transaction.listAttachments({
            companyId: input.companyId,
            messageIds: messages.map((message) => message.id),
          }),
        )
        return messages.map((message) => ({
          ...message,
          attachments: attachments.get(message.id) ?? [],
          createdAt: message.createdAt.toISOString(),
        }))
      }),
  }
}

/** Spec 183 T604: as conversas do motorista, para a lista do app; baixar é entregar. */
export function createListMyConversationsUseCase(dependencies: {
  readonly clock: () => Date
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    list: (input: { readonly companyId: string; readonly driverUserId: string }) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const conversations = await transaction.listMyConversations(input)
        await transaction.applyDriverStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          incoming: 'delivered',
          occurrenceId: null,
        })
        return conversations.map((conversation) => ({
          ...conversation,
          lastMessageAt: conversation.lastMessageAt.toISOString(),
        }))
      }),
  }
}

/** Spec 183 T604: abrir a conversa no app é ler as mensagens da operação. */
export function createMarkMyConversationReadUseCase(dependencies: {
  readonly clock: () => Date
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    markRead: (input: MyOccurrenceInput) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const occurrence = await transaction.findMyOccurrence(input)
        if (occurrence === null) throw new TripOccurrenceNotFoundError()
        await transaction.applyDriverStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          incoming: 'read',
          occurrenceId: input.occurrenceId,
        })
      }),
  }
}

export function createReplyMyOccurrenceConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    async reply(
      input: MyOccurrenceInput & {
        /** Spec 183 T702a (RF10): pedidos de upload deste motorista para esta conversa. */
        readonly attachmentIds?: readonly string[]
        readonly bodyText: string
        readonly idempotencyKey: string
      },
    ): Promise<{ readonly conversationId: string; readonly messageId: string }> {
      const attachmentIds = input.attachmentIds ?? []
      const bodyText = normalizeConversationMessageBody(input.bodyText, attachmentIds)
      const now = dependencies.clock()
      return dependencies.unitOfWork.execute(async (transaction) => {
        const occurrence = await transaction.findMyOccurrence(input)
        if (occurrence === null) throw new TripOccurrenceNotFoundError()
        /**
         * T903 (C1): o motorista principal de agora assume a conversa ao responder; outro da
         * tripulação só responde se já for o destinatário dela.
         */
        const target = await transaction.findDriverTarget(input)
        const executed = await replayOrRun({
          companyId: input.companyId,
          fields: [
            input.companyId,
            input.occurrenceId,
            input.driverUserId,
            bodyText,
            attachmentIds.join(','),
          ],
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: REPLY_DRIVER_APP_MESSAGE_OPERATION,
          run: async () => {
            const conversation = await transaction.findOrCreateDriverConversation({
              companyId: input.companyId,
              driverUserId: input.driverUserId,
              occurrenceId: input.occurrenceId,
              occurrenceKind: occurrence.occurrenceKind,
              retarget: target?.driverUserId === input.driverUserId,
            })
            if (conversation.driverUserId !== input.driverUserId) {
              throw new OccurrenceConversationDriverChangedError()
            }
            const message = await transaction.insertMessage({
              authorUserId: null,
              bodyText,
              companyId: input.companyId,
              conversationId: conversation.id,
              createdAt: now,
              direction: 'inbound',
              driverUserId: input.driverUserId,
              idempotencyKey: input.idempotencyKey,
              status: null,
              statusTimes: {},
            })
            await attachConversationUploads({
              messageId: message.id,
              now,
              storage: dependencies.storage,
              target: {
                channel: 'app',
                companyId: input.companyId,
                occurrenceId: input.occurrenceId,
                occurrenceKind: occurrence.occurrenceKind,
                participant: 'driver',
                requestedByUserId: input.driverUserId,
              },
              transaction: transaction.attachments,
              uploadIds: attachmentIds,
            })
            return { conversationId: conversation.id, messageId: message.id }
          },
          transaction,
        })
        return executed.result
      })
    },
  }
}

/**
 * Spec 183 T702a (RF10): o motorista pede o upload do anexo da resposta dele — só em ocorrência de
 * viagem dele, pelo app, para a conversa dele.
 */
export function createRequestMyConversationUploadUseCase(dependencies: {
  readonly bucket: string
  readonly clock: () => Date
  readonly newId: () => string
  readonly repository: ConversationUploadRepositoryPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    async request(
      input: MyOccurrenceInput & {
        readonly contentType: string
        readonly fileName: string
        readonly sizeBytes: number
      },
    ) {
      const occurrence = await dependencies.unitOfWork.execute((transaction) =>
        transaction.findMyOccurrence(input),
      )
      if (occurrence === null) throw new TripOccurrenceNotFoundError()
      const target: ConversationUploadTarget = {
        channel: 'app',
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
        occurrenceKind: occurrence.occurrenceKind,
        participant: 'driver',
        requestedByUserId: input.driverUserId,
      }
      return requestConversationUpload({
        bucket: dependencies.bucket,
        contentType: input.contentType,
        fileName: input.fileName,
        newId: dependencies.newId,
        now: dependencies.clock(),
        repository: dependencies.repository,
        sizeBytes: input.sizeBytes,
        storage: dependencies.storage,
        target,
      })
    },
  }
}
