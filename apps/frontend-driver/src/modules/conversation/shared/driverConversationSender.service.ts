/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  participantMessageSchema,
  type ParticipantAttachment,
} from '@adatechnology/conversation-contracts'
import type {
  ParticipantSendInput,
  ParticipantSendResult,
} from '@adatechnology/conversations-ui/participant'

import type { DrainOrigin } from '@/modules/driver-trip/shared/retryBackoff.service'

import type { ConversationOutbox } from './conversationOutbox.service'
import type { OutboxMessage } from './conversationOutbox.types'
import { classifyDeliveryFailure } from './conversationOutboxFailure.service'
import { DRIVER_CONVERSATION_ERROR } from './driverConversation.constant'
import type { DriverConversationRoutes } from './driverConversationRoutes.service'
import { DriverConversationRequestError } from './driverConversationsHttp.service'
import { assertSupportedSubject } from './driverConversationSubject.service'
import type { DriverConversationUploader } from './driverConversationUploads.service'

export type DriverConversationSenderDependencies = Readonly<{
  isOnline: () => boolean
  now: () => Date
  outbox: ConversationOutbox
  routes: DriverConversationRoutes
  uploader: DriverConversationUploader
}>

export type DriverConversationSender = Readonly<{
  flushOutbox: (origin: DrainOrigin) => Promise<void>
  retryPending: (clientMessageId: string) => Promise<void>
  sendMessage: (input: ParticipantSendInput) => Promise<ParticipantSendResult>
}>

type PostMessageInput = Readonly<{
  attachments: readonly ParticipantAttachment[]
  clientMessageId: string
  subject: ParticipantSendInput['subject']
  text: string
}>

/** A rota nova devolve a mensagem (`id`); a antiga, `{ conversationId, messageId }`. */
function readMessageId(payload: unknown): string {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  if (typeof data === 'object' && data !== null) {
    if ('id' in data && typeof data.id === 'string') return data.id
    if ('messageId' in data && typeof data.messageId === 'string') return data.messageId
  }
  throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
}

function toFile(file: OutboxMessage['files'][number]): File {
  return new File([file.blob], file.name, { type: file.type })
}

export function createDriverConversationSender(
  dependencies: DriverConversationSenderDependencies,
): DriverConversationSender {
  const { outbox, routes, uploader } = dependencies

  /** A `Idempotency-Key` é o `clientMessageId` em toda tentativa: o servidor devolve a resposta salva. */
  async function postMessage(input: PostMessageInput): Promise<string> {
    const attachmentIds = input.attachments.map((attachment) => attachment.id)
    const payload = await routes.postMessage(input.subject, {
      body: { body: input.text, ...(attachmentIds.length === 0 ? {} : { attachmentIds }) },
      headers: { 'idempotency-key': input.clientMessageId },
    })
    return readMessageId(payload)
  }

  async function deliverQueued(message: OutboxMessage): Promise<void> {
    const attachments =
      message.attachments ??
      (await uploader.upload({
        files: message.files.map(toFile),
        subject: message.subject,
      }))
    if (message.attachments === undefined && attachments.length > 0) {
      await outbox.rememberAttachments({ attachments, clientMessageId: message.clientMessageId })
    }
    await postMessage({ ...message, attachments })
  }

  async function sendUploaded(
    input: ParticipantSendInput,
    attachments: readonly ParticipantAttachment[],
  ): Promise<ParticipantSendResult> {
    const id = await postMessage({ ...input, attachments, text: input.text ?? '' })
    const message = participantMessageSchema.parse({
      attachments,
      clientMessageId: input.clientMessageId,
      createdAt: dependencies.now().toISOString(),
      direction: 'inbound',
      id,
      text: input.text,
    })
    return { message, outcome: 'sent' }
  }

  async function enqueue(
    input: ParticipantSendInput,
    attachments?: readonly ParticipantAttachment[],
  ): Promise<ParticipantSendResult> {
    await outbox.enqueue({
      attachments,
      clientMessageId: input.clientMessageId,
      files: input.files ?? [],
      subject: input.subject,
      text: input.text ?? '',
    })
    return { outcome: 'queued' }
  }

  return {
    flushOutbox: (origin) => outbox.flush({ deliver: deliverQueued, origin }),
    async retryPending(clientMessageId) {
      await outbox.requeue(clientMessageId)
      await outbox.flush({ deliver: deliverQueued, origin: 'immediate' })
    },
    async sendMessage(input) {
      assertSupportedSubject(input.subject)
      if (!dependencies.isOnline()) return enqueue(input)
      let uploaded: readonly ParticipantAttachment[] | undefined
      try {
        uploaded = await uploader.upload({ files: input.files ?? [], subject: input.subject })
        return await sendUploaded(input, uploaded)
      } catch (error) {
        if (classifyDeliveryFailure(error) === 'permanent') throw error
        return enqueue(input, uploaded)
      }
    },
  }
}
