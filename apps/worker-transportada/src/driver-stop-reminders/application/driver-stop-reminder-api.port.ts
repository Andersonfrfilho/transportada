/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DeliverDriverStopReminderParams = Readonly<{ companyId: string; reminderId: string }>

export type DeliverDriverStopReminderResult = Readonly<{
  nextDueAt: string | null
  outcome: 'closed' | 'deferred' | 'escalated' | 'sent'
}>

export type ReconcileDriverStopRemindersParams = Readonly<{ companyId: string }>

export type ReconcileDriverStopRemindersResult = Readonly<{ openedCount: number }>

export type DriverStopReminderApiPort = Readonly<{
  /** Garante o lembrete da etapa atual das viagens na rua da empresa (a decisão é da API). */
  reconcile: (
    params: ReconcileDriverStopRemindersParams,
  ) => Promise<ReconcileDriverStopRemindersResult>
  deliver: (params: DeliverDriverStopReminderParams) => Promise<DeliverDriverStopReminderResult>
}>
