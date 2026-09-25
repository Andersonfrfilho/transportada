/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21, D9): a operação escreve à contratante pelo canal Portal. A mensagem nasce
 * `delivered` — gravada, já está no portal (a escada do canal é entregue → lida) — e cada conta do
 * portal ligada à contratante recebe um aviso por e-mail **sem o corpo**: quem lê é quem entra no
 * portal. O reenvio da mesma chave devolve o gravado sem gravar nem avisar de novo.
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import {
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationPortalUnavailableError,
} from '../domain/occurrence-conversation.error.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import {
  attachConversationUploads,
  normalizeConversationMessageBody,
} from './conversation-attachment.service.js'
import type {
  ContractorPortalMessageUnitOfWorkPort,
  ContractorPortalNotifierPort,
} from './contractor-portal-message.port.js'

export const SEND_CONTRACTOR_PORTAL_MESSAGE_OPERATION =
  'occurrence-conversation.portal.operator-send'

const ENCODER = new TextEncoder()

export type SendContractorPortalMessageResult = {
  readonly conversationId: string
  readonly conversationMessageId: string
}

type Executed = {
  readonly notice: null | {
    readonly occurrenceLabel: string
    readonly recipientUserIds: readonly string[]
  }
  readonly result: SendContractorPortalMessageResult
}

export function createSendContractorPortalMessageUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly newRef: () => string
  readonly notifier: ContractorPortalNotifierPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: ContractorPortalMessageUnitOfWorkPort
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
    }): Promise<SendContractorPortalMessageResult> {
      const attachmentIds = input.attachmentIds ?? []
      const bodyText = normalizeConversationMessageBody(input.bodyText, attachmentIds)
      const now = dependencies.clock()
      const fingerprint = await dependencies.fingerprintService.create({
        fields: [
          input.companyId,
          input.occurrenceId,
          input.actorUserId,
          bodyText,
          attachmentIds.join(','),
        ].map((value) => ENCODER.encode(value)),
        operation: SEND_CONTRACTOR_PORTAL_MESSAGE_OPERATION,
      })
      const key = {
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: SEND_CONTRACTOR_PORTAL_MESSAGE_OPERATION,
      }

      const executed = await dependencies.unitOfWork.execute(
        async (transaction): Promise<Executed> => {
          const replay = await transaction.findIdempotency(key)
          if (replay !== null) {
            if (replay.fingerprint !== fingerprint) {
              throw new OccurrenceConversationIdempotencyKeyReusedError()
            }
            return { notice: null, result: replay.response as SendContractorPortalMessageResult }
          }
          const found = await transaction.findAudience({
            companyId: input.companyId,
            occurrenceId: input.occurrenceId,
          })
          if (found.kind === 'not_found') throw new TripOccurrenceNotFoundError()
          if (found.kind === 'unavailable' || found.audience.userIds.length === 0) {
            throw new OccurrenceConversationPortalUnavailableError()
          }
          const { audience } = found
          const conversation = await transaction.findOrCreateContractorConversation({
            companyId: input.companyId,
            contractorId: audience.contractorId,
            occurrenceId: input.occurrenceId,
            occurrenceKind: audience.occurrenceKind,
            publicRef: dependencies.newRef(),
          })
          const message = await transaction.insertPortalMessage({
            actorUserId: input.actorUserId,
            bodyText,
            companyId: input.companyId,
            conversationId: conversation.id,
            createdAt: now,
          })
          await attachConversationUploads({
            messageId: message.id,
            now,
            storage: dependencies.storage,
            target: {
              channel: 'portal',
              companyId: input.companyId,
              occurrenceId: input.occurrenceId,
              occurrenceKind: audience.occurrenceKind,
              participant: 'contractor',
              requestedByUserId: input.actorUserId,
            },
            transaction: transaction.attachments,
            uploadIds: attachmentIds,
          })
          const result = { conversationId: conversation.id, conversationMessageId: message.id }
          await transaction.saveIdempotency({ ...key, fingerprint, response: result })
          return {
            notice: {
              occurrenceLabel: audience.occurrenceLabel,
              recipientUserIds: audience.userIds,
            },
            result,
          }
        },
      )

      /** O aviso sai depois do commit: a mensagem já está no portal, e o aviso não a desfaz. */
      if (executed.notice !== null) {
        await dependencies.notifier.notify({
          companyId: input.companyId,
          messageId: executed.result.conversationMessageId,
          occurrenceLabel: executed.notice.occurrenceLabel,
          recipientUserIds: executed.notice.recipientUserIds,
        })
      }
      return executed.result
    },
  }
}
