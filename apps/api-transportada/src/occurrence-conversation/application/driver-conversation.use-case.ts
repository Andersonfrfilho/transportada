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
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import {
  OccurrenceConversationDriverUnknownError,
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationMessageInvalidError,
} from '../domain/occurrence-conversation.error.js'
import type {
  DriverConversationNotifierPort,
  DriverConversationTransactionPort,
  DriverConversationUnitOfWorkPort,
} from './driver-conversation.port.js'

export const SEND_DRIVER_APP_MESSAGE_OPERATION = 'occurrence-conversation.app.send'
export const REPLY_DRIVER_APP_MESSAGE_OPERATION = 'occurrence-conversation.app.reply'

const ENCODER = new TextEncoder()

function normalizeBody(bodyText: string): string {
  const body = bodyText.trim()
  if (body === '' || body.length > OCCURRENCE_MAIL_LIMITS.body) {
    throw new OccurrenceConversationMessageInvalidError()
  }
  return body
}

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
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    async send(input: {
      readonly actorUserId: string
      readonly bodyText: string
      readonly companyId: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }): Promise<SendDriverAppMessageResult> {
      const bodyText = normalizeBody(input.bodyText)
      const now = dependencies.clock()
      const outcome = await dependencies.unitOfWork.execute(async (transaction) => {
        const target = await transaction.findDriverTarget(input)
        if (target === null) throw new TripOccurrenceNotFoundError()
        const { driverUserId } = target
        if (driverUserId === null) throw new OccurrenceConversationDriverUnknownError()

        const executed = await replayOrRun({
          companyId: input.companyId,
          fields: [input.companyId, input.occurrenceId, bodyText],
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: SEND_DRIVER_APP_MESSAGE_OPERATION,
          run: async (): Promise<SendDriverAppMessageResult> => {
            const conversation = await transaction.findOrCreateDriverConversation({
              companyId: input.companyId,
              driverUserId,
              occurrenceId: input.occurrenceId,
              occurrenceKind: target.occurrenceKind,
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
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    list: (input: MyOccurrenceInput) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const occurrence = await transaction.findMyOccurrence(input)
        if (occurrence === null) throw new TripOccurrenceNotFoundError()
        const messages = await transaction.listDriverMessages({
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          occurrenceId: input.occurrenceId,
          occurrenceKind: occurrence.occurrenceKind,
        })
        return messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        }))
      }),
  }
}

export function createReplyMyOccurrenceConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}) {
  return {
    async reply(
      input: MyOccurrenceInput & { readonly bodyText: string; readonly idempotencyKey: string },
    ): Promise<{ readonly conversationId: string; readonly messageId: string }> {
      const bodyText = normalizeBody(input.bodyText)
      const now = dependencies.clock()
      return dependencies.unitOfWork.execute(async (transaction) => {
        const occurrence = await transaction.findMyOccurrence(input)
        if (occurrence === null) throw new TripOccurrenceNotFoundError()
        const executed = await replayOrRun({
          companyId: input.companyId,
          fields: [input.companyId, input.occurrenceId, input.driverUserId, bodyText],
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: REPLY_DRIVER_APP_MESSAGE_OPERATION,
          run: async () => {
            const conversation = await transaction.findOrCreateDriverConversation({
              companyId: input.companyId,
              driverUserId: input.driverUserId,
              occurrenceId: input.occurrenceId,
              occurrenceKind: occurrence.occurrenceKind,
            })
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
            return { conversationId: conversation.id, messageId: message.id }
          },
          transaction,
        })
        return executed.result
      })
    },
  }
}
