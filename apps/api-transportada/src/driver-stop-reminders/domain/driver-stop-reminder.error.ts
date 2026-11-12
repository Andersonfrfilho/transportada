/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Inexistente ou de outra empresa: a resposta é a mesma (BOLA). */
export class DriverStopReminderNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_STOP_REMINDER_NOT_FOUND',
      message: 'The driver stop reminder is not registered in this company.',
      status: 404,
    })
  }
}

/** O grupo já tem outro pedido aberto: o lembrete não pode abrir o passo da resposta e, por isso, não é enviado. */
export class ReminderPromptBusyError extends Error {
  public constructor() {
    super('The group already has an open request, so the reminder prompt cannot be opened.')
    this.name = 'ReminderPromptBusyError'
  }
}
