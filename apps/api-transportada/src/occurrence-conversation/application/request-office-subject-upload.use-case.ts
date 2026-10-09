/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (api-contract): o escritório pede a URL de subida do anexo de uma mensagem ao motorista
 * na conversa de nota ou de viagem — apontada pelo `conversation_id`, que precisa existir (abrir antes).
 * Conversa encerrada não recebe arquivo. O pedido é do operador que o fez: só ele o liga a uma mensagem.
 */
import {
  ConversationClosedError,
  ConversationNotFoundError,
} from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentStoragePort,
  ConversationUploadRepositoryPort,
} from './conversation-attachment.port.js'
import {
  requestConversationUpload,
  type RequestConversationUploadResult,
} from './conversation-attachment.service.js'
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import {
  findOfficeSubjectOrFail,
  resolveOfficeSubjectStatus,
} from './office-subject-access.service.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'

export function createRequestOfficeSubjectUploadUseCase(dependencies: {
  readonly bucket: string
  readonly clock: () => Date
  readonly newId: () => string
  readonly repository: ConversationUploadRepositoryPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  async function findConversationId(input: OfficeSubjectInput): Promise<string> {
    return dependencies.unitOfWork.execute(async (transaction) => {
      const subject = await findOfficeSubjectOrFail(transaction, input)
      if (subject.conversation === null) throw new ConversationNotFoundError()
      if (resolveOfficeSubjectStatus(subject, input.subjectType) === 'closed') {
        throw new ConversationClosedError()
      }
      return subject.conversation.id
    })
  }

  return {
    async request(
      input: OfficeSubjectInput & {
        readonly actorUserId: string
        readonly contentType: string
        readonly fileName: string
        readonly sizeBytes: number
      },
    ): Promise<RequestConversationUploadResult> {
      const conversationId = await findConversationId(input)
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
          channel: 'app',
          companyId: input.companyId,
          conversationId,
          participant: 'driver',
          requestedByUserId: input.actorUserId,
        },
      })
    },
  }
}
