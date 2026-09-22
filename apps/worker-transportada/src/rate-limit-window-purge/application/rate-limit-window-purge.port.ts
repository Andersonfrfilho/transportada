/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type PurgeExpiredRateLimitWindowsInput = {
  /** Janela com `window_start` anterior a este instante é apagada. */
  readonly before: Date
  readonly limit: number
}

/** Apaga **um lote** de janelas vencidas e devolve quantas saíram. */
export type PurgeExpiredRateLimitWindows = (
  input: PurgeExpiredRateLimitWindowsInput,
) => Promise<number>
