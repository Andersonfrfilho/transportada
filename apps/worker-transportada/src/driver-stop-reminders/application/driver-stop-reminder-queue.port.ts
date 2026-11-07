/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DueDriverStopReminder = Readonly<{ companyId: string; reminderId: string }>

export type ListDueDriverStopRemindersParams = Readonly<{
  excludeReminderIds: readonly string[]
  limit: number
  now: Date
}>

export type DriverStopReminderQueuePort = Readonly<{
  listDue: (params: ListDueDriverStopRemindersParams) => Promise<readonly DueDriverStopReminder[]>
}>
