/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DriverStopReminderApiFailureOutcome =
  | 'api_unauthorized'
  | 'api_unreachable'
  | 'request_rejected'

/** Só o resultado e o status entram na mensagem: o corpo da resposta e o segredo do cliente nunca. */
export class DriverStopReminderApiError extends Error {
  override readonly name = 'DriverStopReminderApiError'

  constructor(
    readonly outcome: DriverStopReminderApiFailureOutcome,
    status?: number,
  ) {
    super(`driver_stop_reminder_api_${outcome}${status === undefined ? '' : `:${status}`}`)
  }
}
