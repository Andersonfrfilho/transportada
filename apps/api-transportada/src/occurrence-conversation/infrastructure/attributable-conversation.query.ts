/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T903 (achado C2): o que é "conversa aberta" para a atribuição do WhatsApp (RF9) e para as
 * candidatas da fila de mensagens sem conversa. `status = 'open'` sozinho não diz nada: nenhuma
 * conversa fecha, e a leitura do portal cria a conversa de toda ocorrência visível.
 *
 * - Sempre: a ocorrência está aberta na definição da spec (T206) — a tratativa ainda não chegou a
 *   estado terminal.
 * - Na atribuição automática, também: a conversa já tem mensagem. A conversa que só foi criada não
 *   disputa com a que está em andamento. Na escolha do operador, ela fica — pode ser justamente a
 *   ocorrência de que a contratante fala e ninguém escreveu ainda.
 *
 * Só leitura — nada aqui escreve na tratativa (D4).
 */
import { and, eq, sql, type SQL } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/occurrence-conversation.schema.js'
import { terminalOccurrenceCaseExists } from '../../trips/infrastructure/terminal-occurrence-case.query.js'

export function attributableContractorConversation(input: {
  readonly requireMessage: boolean
}): SQL {
  const hasMessage = sql`exists (
    select 1 from ${occurrenceConversationMessages}
    where ${and(
      eq(occurrenceConversationMessages.companyId, occurrenceConversations.companyId),
      eq(occurrenceConversationMessages.conversationId, occurrenceConversations.id),
    )}
  )`
  /** A tratativa é de `trips`: a conversa só pergunta se ela está encerrada (D4). */
  const occurrenceClosed = terminalOccurrenceCaseExists({
    companyId: occurrenceConversations.companyId,
    isDocumentOccurrence: eq(occurrenceConversations.occurrenceKind, 'document'),
    occurrenceId: occurrenceConversations.occurrenceId,
  })
  const open = sql`(${eq(occurrenceConversations.status, 'open')} and not ${occurrenceClosed})`
  return input.requireMessage ? sql`(${open} and ${hasMessage})` : open
}
