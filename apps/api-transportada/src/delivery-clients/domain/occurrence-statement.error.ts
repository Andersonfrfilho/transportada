/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20: os erros do demonstrativo de ressarcimento.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * O lote existe, mas o demonstrativo ainda não — lote fechado antes desta spec, ou fechamento em
 * que a geração falhou. 404 do artefato, nunca 404 do lote: são coisas diferentes e a tela precisa
 * distinguir "esse lote não é seu" de "esse lote não tem PDF".
 */
export class ExtraChargeBatchStatementNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXTRA_CHARGE_BATCH_STATEMENT_NOT_FOUND',
      message: 'This extra charge batch has no statement document',
      status: 404,
    })
  }
}

/**
 * Recusa controlada acima do teto (`OCCURRENCE_STATEMENT_MAX_BYTES`). 422 e não 500: o lote é
 * grande demais para um demonstrativo só, e a saída é fechar em dois lotes — é decisão de quem
 * opera, não defeito do servidor.
 */
export class ExtraChargeBatchStatementTooLargeError extends ApiError {
  public constructor(input: { readonly limitBytes: number; readonly measuredBytes: number }) {
    super({
      code: 'EXTRA_CHARGE_BATCH_STATEMENT_TOO_LARGE',
      details: [
        { field: 'limitBytes', message: String(input.limitBytes) },
        { field: 'measuredBytes', message: String(input.measuredBytes) },
      ],
      message: 'The statement document would exceed the maximum allowed size',
      status: 422,
    })
  }
}
