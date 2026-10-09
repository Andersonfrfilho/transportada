/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (RF8, RF14, RF15): a lista de conversas do motorista, uma por assunto, com protocolo,
 * canais, ícone e "espera resposta". Página por cursor; baixar é entregar, só para as conversas da página.
 */
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { DRIVER_SUBJECT_LIST_PAGE_SIZE } from '../domain/driver-subject-conversation.constant.js'
import type { DriverSubjectUnitOfWorkPort } from './driver-conversation-subject.port.js'
import { toSubjectConversationSummary } from './driver-subject-conversation.types.js'

export function createListMySubjectConversationsUseCase(dependencies: {
  readonly clock: () => Date
  readonly unitOfWork: DriverSubjectUnitOfWorkPort
}) {
  return {
    list: (input: {
      readonly companyId: string
      readonly cursor: null | string
      readonly driverId: string
      readonly driverUserId: string
    }) =>
      dependencies.unitOfWork.execute(async (transaction) => {
        const page = await transaction.listMySubjects({
          companyId: input.companyId,
          cursor: decodeKeysetCursor(input.cursor),
          driverId: input.driverId,
          driverUserId: input.driverUserId,
          limit: DRIVER_SUBJECT_LIST_PAGE_SIZE,
        })
        await transaction.applySubjectStatus({
          at: dependencies.clock(),
          companyId: input.companyId,
          conversationIds: page.rows.map((row) => row.conversationId),
          incoming: 'delivered',
        })
        const officeReadAt = await transaction.readOfficeReadAtByConversation({
          companyId: input.companyId,
          conversationIds: page.rows.map((row) => row.conversationId),
        })
        const last = page.rows.at(-1)
        return {
          data: page.rows.map((row) =>
            toSubjectConversationSummary(row, officeReadAt.get(row.conversationId)),
          ),
          nextCursor:
            page.hasMore && last !== undefined
              ? encodeKeysetCursor({ createdAt: last.sortAt, id: last.conversationId })
              : null,
        }
      }),
  }
}
