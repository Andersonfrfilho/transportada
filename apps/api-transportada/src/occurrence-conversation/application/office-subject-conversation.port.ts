/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (ADR-0101): as portas da conversa de nota e de viagem vista pelo escritório. Tudo parte
 * da viagem do caminho: o assunto precisa ser dela, na empresa do contexto, ou é o mesmo 404 da
 * inexistente. Só dados do assunto e da conversa — a conversa não decide nada da tratativa, da taxa nem do acerto.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { EffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import type { SubjectLabelFacts } from '../domain/conversation-subject-label.policy.js'
import type { OpenableSubjectType } from '../domain/driver-subject-conversation.constant.js'
import type { DriverConversationTransactionPort } from './driver-conversation.port.js'
import type {
  DriverSubjectTransactionPort,
  SubjectConversationRow,
  SubjectMessageRecord,
} from './driver-conversation-subject.port.js'

export type OfficeSubjectKey = {
  readonly companyId: string
  readonly subjectId: string
  readonly subjectType: OpenableSubjectType
  readonly tripId: string
}

export type OfficeSubject = {
  readonly conversation: null | {
    readonly driverUserId: string
    readonly id: string
    readonly storedStatus: EffectiveConversationStatus
  }
  readonly documentReleasedAt: Date | null
  readonly labelFacts: SubjectLabelFacts
  readonly tripStatus: TripStatus | null
}

export type OfficeSubjectRow = SubjectConversationRow & { readonly driverName: null | string }

export type OfficeSubjectTransactionPort = Pick<
  DriverConversationTransactionPort,
  'attachments' | 'findIdempotency' | 'insertMessage' | 'saveIdempotency'
> &
  Pick<DriverSubjectTransactionPort, 'findOrCreateSubjectConversation' | 'listAttachments'> & {
    /** A mensagem pelo id na conversa, com o nome de quem escreveu (operação ou motorista). */
    findOfficeMessage(input: {
      readonly companyId: string
      readonly conversationId: string
      readonly messageId: string
    }): Promise<SubjectMessageRecord | null>
    /** O assunto só se é da viagem na empresa; `null` em todo o resto (BOLA). */
    findOfficeSubject(input: OfficeSubjectKey): Promise<OfficeSubject | null>
    /** O usuário (vínculo ativo) do motorista principal da viagem agora. */
    findPrincipalDriverUserId(input: {
      readonly companyId: string
      readonly tripId: string
    }): Promise<null | string>
    /** Em ordem crescente; `before` é o id da mensagem mais antiga que a tela já tem. */
    listOfficeMessages(input: {
      readonly before: null | string
      readonly companyId: string
      readonly conversationId: string
      readonly limit: number
    }): Promise<readonly SubjectMessageRecord[]>
    /** As conversas de nota e de viagem da viagem; `null` se a viagem não é da empresa. */
    listTripConversations(input: {
      readonly companyId: string
      readonly conversationId?: string
      readonly tripId: string
      readonly userId: string
    }): Promise<{ readonly rows: readonly OfficeSubjectRow[] } | null>
    /** RF15: até a última mensagem da conversa, por usuário do escritório. */
    markConversationRead(input: {
      readonly companyId: string
      readonly conversationId: string
      readonly userId: string
    }): Promise<void>
    setStoredStatus(input: {
      readonly companyId: string
      readonly conversationId: string
      readonly status: EffectiveConversationStatus
    }): Promise<void>
  }

export type OfficeSubjectUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: OfficeSubjectTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O aviso ao motorista (T2.5): o adaptador o entrega pela chave `trip.subject-conversation-message`. */
export type OfficeSubjectNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly dedupeKey: string
    readonly protocol: string
    readonly recipientUserId: string
    readonly subjectId: string
    readonly subjectLabel: string
    readonly subjectType: OpenableSubjectType
  }): Promise<void>
}
