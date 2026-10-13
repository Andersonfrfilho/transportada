/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_CONVERSATION_ERROR,
  QUICK_REPLIES_PATH,
  SERVER_ERROR_MIN_STATUS,
} from './driverConversation.constant'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'

export type DriverQuickReply = Readonly<{ id: string; text: string }>

export type DriverQuickRepliesStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export type DriverQuickRepliesDependencies = Readonly<{
  getOwnerKey: () => string | undefined
  http: Pick<DriverConversationHttp, 'getJson'>
  storage: DriverQuickRepliesStorage | null
}>

const STORAGE_KEY_PREFIX = 'transportada.driver-quick-replies.v1'

function isDriverQuickReply(value: unknown): value is DriverQuickReply {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length > 0
  )
}

function parseQuickReplies(payload: unknown): readonly DriverQuickReply[] | undefined {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return undefined
  const { data } = payload
  if (!Array.isArray(data) || !data.every(isDriverQuickReply)) return undefined
  return data.map(({ id, text }) => ({ id, text }))
}

/** A API respondeu "não": o motorista não tem lista. Corpo ilegível (portal de rede, proxy) não é recusa e não apaga a guardada. */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof DriverConversationRequestError &&
    error.status !== undefined &&
    error.status < SERVER_ERROR_MIN_STATUS
  )
}

/** Rede, token ou servidor fora: a resposta não chegou, e a última lista guardada vale. */
function isOutage(error: unknown): boolean {
  if (!(error instanceof DriverConversationRequestError)) return true
  if (error.status === undefined) return error.code !== DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID
  return error.status >= SERVER_ERROR_MIN_STATUS
}

/**
 * A lista é por motorista: o dono da sessão entra na chave, e sem dono não há cache (outro motorista
 * no mesmo aparelho nunca herda os chips do anterior).
 */
export function createDriverQuickReplies(dependencies: DriverQuickRepliesDependencies) {
  function storageKey(): string | undefined {
    const ownerKey = dependencies.getOwnerKey()
    return ownerKey === undefined ? undefined : `${STORAGE_KEY_PREFIX}:${ownerKey}`
  }

  function readCache(): readonly DriverQuickReply[] {
    const key = storageKey()
    if (key === undefined) return []
    try {
      const raw = dependencies.storage?.getItem(key)
      return raw == null ? [] : (parseQuickReplies({ data: JSON.parse(raw) as unknown }) ?? [])
    } catch {
      return []
    }
  }

  function writeCache(quickReplies: readonly DriverQuickReply[] | undefined): void {
    const key = storageKey()
    if (key === undefined) return
    try {
      if (quickReplies === undefined) dependencies.storage?.removeItem(key)
      else dependencies.storage?.setItem(key, JSON.stringify(quickReplies))
    } catch {
      // Sem armazenamento (aba privada, cota cheia): só não há lista para a próxima queda de rede.
    }
  }

  /** Nunca lança: chip é conforto, e a tela de conversa não pode cair por causa dele. */
  async function fetchQuickReplies(): Promise<readonly DriverQuickReply[]> {
    try {
      const quickReplies = parseQuickReplies(await dependencies.http.getJson(QUICK_REPLIES_PATH))
      if (quickReplies === undefined) return []
      writeCache(quickReplies)
      return quickReplies
    } catch (error) {
      if (isOutage(error)) return readCache()
      if (isRefusal(error)) writeCache(undefined)
      return []
    }
  }

  return { fetchQuickReplies }
}
