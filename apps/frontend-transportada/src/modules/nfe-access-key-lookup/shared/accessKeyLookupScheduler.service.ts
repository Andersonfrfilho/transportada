/* Copyright (c) 2026 Ada Technology. MIT License. */

export type QueueScheduler = Readonly<{
  clear: (handle: unknown) => void
  now: () => number
  schedule: (task: () => void, delayMs: number) => unknown
}>

export const BROWSER_SCHEDULER: QueueScheduler = {
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  schedule: (task, delayMs) => setTimeout(task, delayMs),
}
