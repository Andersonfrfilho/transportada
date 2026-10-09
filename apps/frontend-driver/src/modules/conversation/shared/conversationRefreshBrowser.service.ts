/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ConversationRefreshTickerDependencies } from './conversationRefreshTicker.service'

type BrowserRefreshEnvironment = Pick<
  ConversationRefreshTickerDependencies,
  'bindTriggers' | 'isOnline' | 'isVisible' | 'startTimer'
>

export function createBrowserRefreshEnvironment(): BrowserRefreshEnvironment {
  return {
    bindTriggers({ refreshNow, syncVisibility }) {
      if (typeof window === 'undefined') return () => undefined
      window.addEventListener('online', refreshNow)
      window.addEventListener('focus', refreshNow)
      document.addEventListener('visibilitychange', syncVisibility)
      return () => {
        window.removeEventListener('online', refreshNow)
        window.removeEventListener('focus', refreshNow)
        document.removeEventListener('visibilitychange', syncVisibility)
      }
    },
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    startTimer(callback, intervalMs) {
      const timerId = setInterval(callback, intervalMs)
      return () => clearInterval(timerId)
    },
  }
}
