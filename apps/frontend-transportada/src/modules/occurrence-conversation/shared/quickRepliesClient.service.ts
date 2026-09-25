/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from '@/modules/trip/shared/tripGuards.validation'

import type { QuickReply, QuickReplyAudience } from './occurrenceConversation.types'
import { requestJson, type ClientDependencies } from './occurrenceConversationClient.service'

const QUICK_REPLIES_PATH = '/company-settings/quick-replies'
const COMPOSER_PATH = '/occurrence-quick-replies'

export type QuickRepliesClient = Readonly<{
  create: (input: { audience: QuickReplyAudience; text: string }) => Promise<void>
  listAll: () => Promise<readonly QuickReply[]>
  listForComposer: (audience: QuickReplyAudience) => Promise<readonly QuickReply[]>
  reorder: (input: { audience: QuickReplyAudience; ids: readonly string[] }) => Promise<void>
  update: (input: { active?: boolean; id: string; text?: string }) => Promise<void>
}>

function toQuickReply(value: unknown): null | QuickReply {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.text) ||
    typeof value.active !== 'boolean' ||
    typeof value.position !== 'number' ||
    (value.audience !== 'contractor' && value.audience !== 'driver')
  ) {
    return null
  }
  return {
    active: value.active,
    audience: value.audience,
    id: value.id,
    position: value.position,
    text: value.text,
  }
}

function toQuickReplies(payload: unknown): readonly QuickReply[] {
  const data = isRecord(payload) ? payload.data : undefined
  return Array.isArray(data) ? data.flatMap((item) => toQuickReply(item) ?? []) : []
}

/** Spec 183 T701 (RF12): o cadastro (`settings.manage`) e a leitura do compositor. */
export function createQuickRepliesClient(dependencies: ClientDependencies): QuickRepliesClient {
  return {
    async create(input) {
      await requestJson(dependencies, QUICK_REPLIES_PATH, { body: input, method: 'POST' })
    },
    async listAll() {
      return toQuickReplies(await requestJson(dependencies, QUICK_REPLIES_PATH))
    },
    async listForComposer(audience) {
      return toQuickReplies(
        await requestJson(
          dependencies,
          `${COMPOSER_PATH}?audience=${encodeURIComponent(audience)}`,
        ),
      )
    },
    async reorder(input) {
      await requestJson(dependencies, `${QUICK_REPLIES_PATH}/order`, {
        body: input,
        method: 'PUT',
      })
    },
    async update({ id, ...body }) {
      await requestJson(dependencies, `${QUICK_REPLIES_PATH}/${encodeURIComponent(id)}`, {
        body,
        method: 'PATCH',
      })
    },
  }
}
