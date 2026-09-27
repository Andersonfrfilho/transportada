/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as respostas rápidas da empresa, por público. O cadastro lê todas; o
 * compositor, só as ativas do público da aba. A nova entra no fim; reordenar exige exatamente as
 * respostas daquele público; desativar não apaga — quem cadastrou pode religar. Nada daqui decide:
 * o operador ainda edita o texto antes de mandar (D4).
 */
import {
  COMPANY_QUICK_REPLY_MAX_LENGTH,
  type CompanyQuickReplyAudience,
} from '../../database/occurrence-conversation.schema.js'
import {
  QuickReplyInvalidError,
  QuickReplyNotFoundError,
  QuickReplyOrderInvalidError,
} from '../domain/occurrence-conversation.error.js'
import type { QuickRepliesUnitOfWorkPort, QuickReplyRecord } from './quick-replies.port.js'

function normalizeText(bodyText: string): string {
  const text = bodyText.trim()
  if (text === '' || text.length > COMPANY_QUICK_REPLY_MAX_LENGTH)
    throw new QuickReplyInvalidError()
  return text
}

export type QuickRepliesUseCase = ReturnType<typeof createQuickRepliesUseCase>

export function createQuickRepliesUseCase(dependencies: {
  readonly unitOfWork: QuickRepliesUnitOfWorkPort
}) {
  return {
    async create(input: {
      readonly audience: CompanyQuickReplyAudience
      readonly bodyText: string
      readonly companyId: string
    }): Promise<QuickReplyRecord> {
      const bodyText = normalizeText(input.bodyText)
      return dependencies.unitOfWork.execute(async (transaction) => {
        const position = await transaction.countByAudience(input)
        return transaction.insert({ ...input, bodyText, position })
      })
    },

    async listAll(input: { readonly companyId: string }): Promise<readonly QuickReplyRecord[]> {
      return dependencies.unitOfWork.execute((transaction) =>
        transaction.list({ activeOnly: false, audience: null, companyId: input.companyId }),
      )
    },

    async listForComposer(input: {
      readonly audience: CompanyQuickReplyAudience
      readonly companyId: string
    }): Promise<readonly QuickReplyRecord[]> {
      return dependencies.unitOfWork.execute((transaction) =>
        transaction.list({ activeOnly: true, ...input }),
      )
    },

    async reorder(input: {
      readonly audience: CompanyQuickReplyAudience
      readonly companyId: string
      readonly ids: readonly string[]
    }): Promise<void> {
      await dependencies.unitOfWork.execute(async (transaction) => {
        const current = await transaction.lockAudience(input)
        const known = new Set(current.map((row) => row.id))
        const asked = new Set(input.ids)
        const sameSet =
          asked.size === input.ids.length &&
          asked.size === known.size &&
          input.ids.every((id) => known.has(id))
        if (!sameSet) throw new QuickReplyOrderInvalidError()
        await transaction.setPositions({
          companyId: input.companyId,
          positions: input.ids.map((id, position) => ({ id, position })),
        })
      })
    },

    async update(input: {
      readonly active?: boolean
      readonly bodyText?: string
      readonly companyId: string
      readonly id: string
    }): Promise<QuickReplyRecord> {
      const bodyText = input.bodyText === undefined ? undefined : normalizeText(input.bodyText)
      const updated = await dependencies.unitOfWork.execute((transaction) =>
        transaction.update({
          companyId: input.companyId,
          id: input.id,
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(bodyText === undefined ? {} : { bodyText }),
        }),
      )
      if (updated === null) throw new QuickReplyNotFoundError()
      return updated
    },
  }
}
