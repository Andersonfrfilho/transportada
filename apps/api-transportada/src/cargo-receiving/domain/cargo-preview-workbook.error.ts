/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1 (ADR-0094 §7): toda violação da leitura da prévia é um código estável. Erro da
 * biblioteca de zip ou de XML nunca sai daqui cru — vira `PREVIEW_NOT_A_WORKBOOK`.
 */
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'
import {
  CARGO_PREVIEW_ERROR_MESSAGES,
  type CargoPreviewErrorCode,
} from './cargo-preview-workbook.constant.js'
import type { MonotonicClock, ParseBudget } from './cargo-preview-workbook.types.js'

const PAYLOAD_TOO_LARGE_STATUS = 413
const UNPROCESSABLE_STATUS = 422

export class CargoPreviewWorkbookError extends ApiError {
  public constructor(code: CargoPreviewErrorCode, details?: readonly ApiErrorDetail[]) {
    super({
      code,
      message: CARGO_PREVIEW_ERROR_MESSAGES[code],
      status: code === 'PREVIEW_FILE_TOO_LARGE' ? PAYLOAD_TOO_LARGE_STATUS : UNPROCESSABLE_STATUS,
      ...(details === undefined ? {} : { details }),
    })
  }
}

/** O orçamento corre do primeiro byte: cada etapa chama `check`, e passou do prazo, aborta. */
export function createParseBudget(input: {
  readonly budgetMs: number
  readonly clock: MonotonicClock
}): ParseBudget {
  const startedAt = input.clock()
  return {
    check: () => {
      if (input.clock() - startedAt > input.budgetMs) {
        throw new CargoPreviewWorkbookError('PREVIEW_PARSE_TIMEOUT')
      }
    },
  }
}
