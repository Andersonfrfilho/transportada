/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (api-contract): o motorista pede a URL de subida do anexo da resposta dele, em qualquer dos
 * três assuntos. Ocorrência segue o alvo antigo (`occurrence_kind` + `occurrence_id`); nota e viagem apontam a
 * conversa já aberta (`open` antes) pelo `conversation_id`, e conversa encerrada não recebe arquivo.
 */
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
import { resolveEffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import {
  ConversationClosedError,
  ConversationNotFoundError,
  OccurrenceConversationDriverChangedError,
} from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentStoragePort,
  ConversationUploadRepositoryPort,
  ConversationUploadTarget,
} from './conversation-attachment.port.js'
import {
  requestConversationUpload,
  type RequestConversationUploadResult,
} from './conversation-attachment.service.js'
import type {
  DriverSubjectUnitOfWorkPort,
  MyConversationSubject,
} from './driver-conversation-subject.port.js'
import {
  findMySubjectOrFail,
  isSubjectReachable,
  type MySubjectInput,
} from './driver-subject-access.service.js'

function buildTarget(
  input: MySubjectInput,
  subject: MyConversationSubject,
): ConversationUploadTarget {
  const base = {
    channel: 'app',
    companyId: input.companyId,
    participant: 'driver',
    requestedByUserId: input.driverUserId,
  } as const
  if (subject.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE) {
    if (subject.occurrenceKind === null) throw new ConversationNotFoundError()
    return { ...base, occurrenceId: input.subjectId, occurrenceKind: subject.occurrenceKind }
  }
  if (subject.conversation === null) throw new ConversationNotFoundError()
  const status = resolveEffectiveConversationStatus({
    documentReleasedAt: subject.documentReleasedAt,
    storedStatus: subject.conversation.storedStatus,
    subjectType: subject.subjectType,
    tripStatus: subject.tripStatus,
  })
  if (status === 'closed') throw new ConversationClosedError()
  if (!isSubjectReachable(subject, input.driverUserId)) {
    throw new OccurrenceConversationDriverChangedError()
  }
  return { ...base, conversationId: subject.conversation.id }
}

export function createRequestMySubjectUploadUseCase(dependencies: {
  readonly bucket: string
  readonly clock: () => Date
  readonly newId: () => string
  readonly repository: ConversationUploadRepositoryPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: DriverSubjectUnitOfWorkPort
}) {
  return {
    async request(
      input: MySubjectInput & {
        readonly contentType: string
        readonly fileName: string
        readonly sizeBytes: number
      },
    ): Promise<RequestConversationUploadResult> {
      const target = await dependencies.unitOfWork.execute(async (transaction) =>
        buildTarget(input, await findMySubjectOrFail(transaction, input)),
      )
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
