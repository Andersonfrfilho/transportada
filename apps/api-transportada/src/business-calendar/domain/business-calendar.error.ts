/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: toda recusa do calendário carrega um código estável de
 * `BUSINESS_CALENDAR_ERROR_CODE`. O calendário nunca "assume" — data, cidade, regra ou ano que ele
 * não sabe responder viram este erro, e quem chama decide o que mostrar.
 */
import { ApiError } from '../../shared/api.error.js'
import type { BusinessCalendarErrorCode } from './business-calendar.constant.js'

type BusinessCalendarErrorParams = {
  readonly code: BusinessCalendarErrorCode
  readonly message: string
}

export class BusinessCalendarError extends ApiError {
  public constructor({ code, message }: BusinessCalendarErrorParams) {
    super({ code, message, status: 422 })
    this.name = 'BusinessCalendarError'
  }
}
