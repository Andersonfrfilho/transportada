/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (ADR-0101): a porta de escrita da conversa por assunto no `/me`. É a de leitura mais as
 * operações que a resposta do motorista já usa na conversa de ocorrência — idempotência, anexo e inserção —,
 * para a mesma transação servir os três assuntos, e a releitura da mensagem gravada pelo id.
 */
import type { DriverConversationTransactionPort } from './driver-conversation.port.js'
import type {
  DriverSubjectTransactionPort,
  SubjectMessageRecord,
} from './driver-conversation-subject.port.js'

export type DriverSubjectWriteTransactionPort = DriverSubjectTransactionPort &
  Pick<
    DriverConversationTransactionPort,
    | 'attachments'
    | 'findIdempotency'
    | 'findOrCreateDriverConversation'
    | 'insertMessage'
    | 'saveIdempotency'
  > & {
    /** A mensagem pelo id, na empresa e na conversa; `null` se não é desta conversa. */
    findSubjectMessage(input: {
      readonly companyId: string
      readonly conversationId: string
      readonly messageId: string
    }): Promise<SubjectMessageRecord | null>
  }

export type DriverSubjectWriteUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: DriverSubjectWriteTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
