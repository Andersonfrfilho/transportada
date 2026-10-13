/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationEvent } from '@adatechnology/conversations-ui/participant'

import { CONVERSATION_REFRESH_MAX_SKIPPED_CYCLES } from './driverConversation.constant'
import {
  diffConversationSnapshots,
  type ConversationSnapshot,
} from './conversationSnapshot.service'

export type ConversationRefreshTriggers = Readonly<{
  refreshNow: () => void
  syncVisibility: () => void
}>

export type ConversationRefreshTickerDependencies = Readonly<{
  bindTriggers: (triggers: ConversationRefreshTriggers) => () => void
  fetchSnapshot: () => Promise<ConversationSnapshot>
  intervalMs: number
  isOnline: () => boolean
  isVisible: () => boolean
  startTimer: (callback: () => void, intervalMs: number) => () => void
}>

export type ConversationRefreshTicker = Readonly<{
  requestRefresh: () => void
  subscribe: (listener: (event: ParticipantConversationEvent) => void) => () => void
}>

/** Um relógio só para todos os assinantes: busca a lista, compara com a anterior e avisa o que mudou. */
export function createConversationRefreshTicker(
  dependencies: ConversationRefreshTickerDependencies,
): ConversationRefreshTicker {
  const listeners = new Set<(event: ParticipantConversationEvent) => void>()
  let previous: ConversationSnapshot | undefined
  let stopTimer: (() => void) | undefined
  let unbindTriggers: (() => void) | undefined
  let isFetching = false
  let consecutiveFailures = 0
  let skippedCycles = 0

  function emit(event: ParticipantConversationEvent): void {
    for (const listener of [...listeners]) listener(event)
  }

  function applySnapshot(current: ConversationSnapshot): void {
    const before = previous
    previous = current
    if (before === undefined) return
    const { changedSubjects, inboxChanged } = diffConversationSnapshots(before, current)
    for (const subject of changedSubjects) emit({ subject, type: 'conversation-changed' })
    if (inboxChanged) emit({ type: 'inbox-changed' })
  }

  async function runCycle(): Promise<void> {
    if (isFetching || listeners.size === 0) return
    if (!dependencies.isVisible() || !dependencies.isOnline()) return
    isFetching = true
    try {
      applySnapshot(await dependencies.fetchSnapshot())
      consecutiveFailures = 0
    } catch {
      consecutiveFailures += 1
      skippedCycles = Math.min(
        2 ** consecutiveFailures - 1,
        CONVERSATION_REFRESH_MAX_SKIPPED_CYCLES,
      )
    } finally {
      isFetching = false
    }
  }

  function handleTimerTick(): void {
    if (skippedCycles > 0) {
      skippedCycles -= 1
      return
    }
    void runCycle()
  }

  function refreshNow(): void {
    skippedCycles = 0
    void runCycle()
  }

  function syncVisibility(): void {
    if (dependencies.isVisible()) {
      stopTimer ??= dependencies.startTimer(handleTimerTick, dependencies.intervalMs)
      refreshNow()
      return
    }
    stopTimer?.()
    stopTimer = undefined
  }

  function start(): void {
    unbindTriggers = dependencies.bindTriggers({ refreshNow, syncVisibility })
    syncVisibility()
  }

  function stop(): void {
    stopTimer?.()
    unbindTriggers?.()
    stopTimer = undefined
    unbindTriggers = undefined
    previous = undefined
    consecutiveFailures = 0
    skippedCycles = 0
  }

  return {
    requestRefresh: refreshNow,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        if (!listeners.delete(listener)) return
        if (listeners.size === 0) stop()
      }
    },
  }
}
