/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'

import { conversationSubjectKey } from './conversationSnapshot.service'
import { REOPEN_REFUSAL_CODE } from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

export type ReopenRefusalReason = 'alreadyOpen' | 'cancelled'

export type DriverReopenEvent =
  | Readonly<{ subject: ParticipantSubjectRef; type: 'reopen-sent' }>
  | Readonly<{
      reason: ReopenRefusalReason
      subject: ParticipantSubjectRef
      type: 'reopen-refused'
    }>

/**
 * Spec 266 D (dono): tocar em "Reabrir" só arma o assunto, em memória — nada é gravado. A primeira
 * mensagem enviada leva `reopen: true`; a marca passa para a MENSAGEM (`clientMessageId`), para o
 * reenvio do pacote com a mesma chave continuar reabrindo.
 */
export type DriverConversationReopen = Readonly<{
  arm: (subject: ParticipantSubjectRef) => void
  /** Desarma tudo: a conversa saiu de tela e o toque em "Reabrir" não vale mais. */
  clear: () => void
  disarm: (subject: ParticipantSubjectRef) => void
  /** Desarma os assuntos que não são o da conversa aberta agora (a troca de conversa). */
  keepOnly: (subjectKey: string | undefined) => void
  /** Liga a mensagem ao reabrir se o assunto está armado (ou ela já estava ligada) e desarma o assunto. */
  bindMessage: (
    input: Readonly<{ clientMessageId: string; subject: ParticipantSubjectRef }>,
  ) => boolean
  isArmed: (subject: ParticipantSubjectRef) => boolean
  /** Armado ou com a reabertura a caminho (enviando, na fila ou esperando a lista mostrar "aberta"): o campo não trava. */
  isReopening: (subject: ParticipantSubjectRef) => boolean
  isBound: (clientMessageId: string) => boolean
  publish: (event: DriverReopenEvent) => void
  release: (clientMessageId: string) => void
  /** A lista de ocorrências já mostra o assunto aberto: a reabertura a caminho acabou. */
  settle: (subject: ParticipantSubjectRef) => void
  /** O mesmo contrato de `useSyncExternalStore`: avisa quando um assunto arma ou desarma. */
  subscribe: (listener: () => void) => () => void
  subscribeEvents: (listener: (event: DriverReopenEvent) => void) => () => void
  /** Troca a cada arma/desarma: o `getSnapshot` do `useSyncExternalStore`. */
  version: () => number
}>

export function createDriverConversationReopen(): DriverConversationReopen {
  const armed = new Set<string>()
  const pending = new Set<string>()
  const boundMessages = new Set<string>()
  const listeners = new Set<() => void>()
  const eventListeners = new Set<(event: DriverReopenEvent) => void>()
  let version = 0

  function changed(): void {
    version += 1
    for (const listener of listeners) listener()
  }

  return {
    arm(subject) {
      armed.add(conversationSubjectKey(subject))
      changed()
    },
    bindMessage({ clientMessageId, subject }) {
      const key = conversationSubjectKey(subject)
      if (boundMessages.has(clientMessageId)) return true
      if (!armed.has(key)) return false
      boundMessages.add(clientMessageId)
      armed.delete(key)
      pending.add(key)
      changed()
      return true
    },
    clear() {
      if (armed.size === 0) return
      armed.clear()
      changed()
    },
    disarm(subject) {
      if (armed.delete(conversationSubjectKey(subject))) changed()
    },
    keepOnly(subjectKey) {
      const stale = [...armed].filter((key) => key !== subjectKey)
      if (stale.length === 0) return
      for (const key of stale) armed.delete(key)
      changed()
    },
    isArmed: (subject) => armed.has(conversationSubjectKey(subject)),
    isBound: (clientMessageId) => boundMessages.has(clientMessageId),
    isReopening: (subject) => {
      const key = conversationSubjectKey(subject)
      return armed.has(key) || pending.has(key)
    },
    publish(event) {
      if (event.type === 'reopen-refused' && pending.delete(conversationSubjectKey(event.subject))) {
        changed()
      }
      for (const listener of eventListeners) listener(event)
    },
    release: (clientMessageId) => {
      boundMessages.delete(clientMessageId)
    },
    settle(subject) {
      if (pending.delete(conversationSubjectKey(subject))) changed()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeEvents(listener) {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    },
    version: () => version,
  }
}

/** Só o 409 com um dos dois códigos é "reabrir recusado"; qualquer outra falha segue o caminho comum. */
export function readReopenRefusal(error: unknown): ReopenRefusalReason | undefined {
  if (!(error instanceof DriverConversationRequestError) || error.status !== 409) return undefined
  if (error.code === REOPEN_REFUSAL_CODE.ALREADY_OPEN) return 'alreadyOpen'
  if (error.code === REOPEN_REFUSAL_CODE.CANCELLED) return 'cancelled'
  return undefined
}
