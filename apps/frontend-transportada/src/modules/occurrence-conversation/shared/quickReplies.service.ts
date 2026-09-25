/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { QuickReply, QuickReplyAudience } from './occurrenceConversation.types'

/** O teto do texto, igual ao CHECK do banco e ao caso de uso da API (RF12). */
export const QUICK_REPLY_MAX_LENGTH = 500

/** O rascunho do cadastro sai aparado; em branco ou longo demais, o que falta — sem ir à API. */
export function validateQuickReplyDraft(
  draft: string,
): Readonly<{ text: string }> | Readonly<{ error: 'required' | 'tooLong' }> {
  const text = draft.trim()
  if (text === '') return { error: 'required' }
  if (text.length > QUICK_REPLY_MAX_LENGTH) return { error: 'tooLong' }
  return { text }
}

/** Sobe ou desce uma resposta trocando com a vizinha; nas pontas, a ordem fica. */
export function moveQuickReply(
  ids: readonly string[],
  id: string,
  direction: 'down' | 'up',
): readonly string[] {
  const index = ids.indexOf(id)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= ids.length) return ids
  const next = [...ids]
  next[index] = ids[target] ?? id
  next[target] = id
  return next
}

/**
 * A resposta rápida entra no rascunho, nunca no lugar dele: vazio, vira o texto; com algo escrito,
 * vai numa linha nova. O operador ainda edita antes de mandar (D4).
 */
export function insertQuickReply(draft: string, text: string): string {
  const current = draft.trimEnd()
  return current.trim() === '' ? text : `${current}\n${text}`
}

/** As respostas de um público, na ordem gravada. */
export function quickRepliesOf(
  replies: readonly QuickReply[],
  audience: QuickReplyAudience,
): readonly QuickReply[] {
  return replies
    .filter((reply) => reply.audience === audience)
    .toSorted((left, right) => left.position - right.position)
}
