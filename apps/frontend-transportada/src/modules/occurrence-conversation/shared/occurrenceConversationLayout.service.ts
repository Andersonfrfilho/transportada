/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CONVERSATION_LAYOUT_MODES = ['side-by-side', 'tabs'] as const
export type ConversationLayoutMode = (typeof CONVERSATION_LAYOUT_MODES)[number]

const STORAGE_KEY_PREFIX = 'occurrence-conversation-layout'

export function conversationLayoutStorageKey(companyId: string | undefined): string {
  return `${STORAGE_KEY_PREFIX}:${companyId ?? 'default'}`
}

function isLayoutMode(value: unknown): value is ConversationLayoutMode {
  return CONVERSATION_LAYOUT_MODES.includes(value as ConversationLayoutMode)
}

/** A escolha explícita vence; sem ela, lado a lado só em tela larga (≥ 64 rem). */
export function resolveConversationLayout(input: {
  isWide: boolean
  stored: ConversationLayoutMode | null
}): ConversationLayoutMode {
  return input.stored ?? (input.isWide ? 'side-by-side' : 'tabs')
}

/** Preferência é conveniência: storage ausente, bloqueado ou com lixo vira "sem escolha", nunca erro. */
export function readConversationLayout(
  storage: Pick<Storage, 'getItem'> | null,
  key: string,
): ConversationLayoutMode | null {
  try {
    const value = storage?.getItem(key)
    return isLayoutMode(value) ? value : null
  } catch {
    return null
  }
}

export function writeConversationLayout(
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  mode: ConversationLayoutMode,
): void {
  try {
    storage?.setItem(key, mode)
  } catch {
    // preferência não é estado essencial
  }
}
