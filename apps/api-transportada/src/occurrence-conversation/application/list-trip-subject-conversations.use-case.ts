/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (RF12): as conversas de nota e de viagem de uma viagem, para a lista do escritório. Numa
 * consulta de lista e no máximo quatro buscas em lote — nenhuma por conversa. Viagem de outra empresa é 404.
 */
import { ConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
import type { OfficeSubjectUnitOfWorkPort } from './office-subject-conversation.port.js'
import {
  toOfficeSubjectSummary,
  type OfficeSubjectSummary,
} from './office-subject-conversation.types.js'

export function createListTripSubjectConversationsUseCase(dependencies: {
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  return {
    list: (input: {
      readonly companyId: string
      readonly tripId: string
      readonly userId: string
    }): Promise<readonly OfficeSubjectSummary[]> =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const result = await transaction.listTripConversations(input)
        if (result === null) throw new ConversationNotFoundError()
        return result.rows.map(toOfficeSubjectSummary)
      }),
  }
}
