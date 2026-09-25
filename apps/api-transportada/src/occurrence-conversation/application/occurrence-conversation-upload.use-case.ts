/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o operador pede a URL de subida de um anexo para uma das duas conversas da
 * ocorrência. Só os canais que levam anexo nesta fase: o app, para o motorista, e o portal, para a
 * contratante. E-mail e WhatsApp com anexo dependem de decisão (T702e) — até lá, 422. A ocorrência é
 * resolvida pela empresa do contexto; a de outra empresa é o mesmo 404 da inexistente.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationKind,
  OccurrenceConversationParticipant,
} from '../../database/occurrence-conversation.schema.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { OccurrenceConversationChannelUnavailableError } from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentStoragePort,
  ConversationUploadRepositoryPort,
} from './conversation-attachment.port.js'
import {
  requestConversationUpload,
  type RequestConversationUploadResult,
} from './conversation-attachment.service.js'

/** O canal que leva anexo, por participante. */
const ATTACHMENT_CHANNEL_BY_PARTICIPANT: Readonly<
  Record<OccurrenceConversationParticipant, OccurrenceConversationChannel>
> = { contractor: 'portal', driver: 'app' }

export type OccurrenceKindReaderPort = {
  findKind(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceConversationKind | null>
}

export function createRequestOccurrenceConversationUploadUseCase(dependencies: {
  readonly bucket: string
  readonly clock: () => Date
  readonly newId: () => string
  readonly occurrences: OccurrenceKindReaderPort
  readonly repository: ConversationUploadRepositoryPort
  readonly storage: ConversationAttachmentStoragePort
}) {
  return {
    async request(input: {
      readonly actorUserId: string
      readonly channel: OccurrenceConversationChannel
      readonly companyId: string
      readonly contentType: string
      readonly fileName: string
      readonly occurrenceId: string
      readonly participant: OccurrenceConversationParticipant
      readonly sizeBytes: number
    }): Promise<RequestConversationUploadResult> {
      if (ATTACHMENT_CHANNEL_BY_PARTICIPANT[input.participant] !== input.channel) {
        throw new OccurrenceConversationChannelUnavailableError()
      }
      const occurrenceKind = await dependencies.occurrences.findKind({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (occurrenceKind === null) throw new TripOccurrenceNotFoundError()
      return requestConversationUpload({
        bucket: dependencies.bucket,
        contentType: input.contentType,
        fileName: input.fileName,
        newId: dependencies.newId,
        now: dependencies.clock(),
        repository: dependencies.repository,
        sizeBytes: input.sizeBytes,
        storage: dependencies.storage,
        target: {
          channel: input.channel,
          companyId: input.companyId,
          occurrenceId: input.occurrenceId,
          occurrenceKind,
          participant: input.participant,
          requestedByUserId: input.actorUserId,
        },
      })
    },
  }
}
