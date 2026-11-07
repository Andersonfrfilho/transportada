/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DeliverDriverStopReminderParams = Readonly<{ companyId: string; reminderId: string }>

export type DeliverDriverStopReminderResult = Readonly<{
  nextDueAt: string | null
  outcome: 'closed' | 'deferred' | 'escalated' | 'sent'
}>

export type DriverStopReminderApiPort = Readonly<{
  deliver: (params: DeliverDriverStopReminderParams) => Promise<DeliverDriverStopReminderResult>
}>
