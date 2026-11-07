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
