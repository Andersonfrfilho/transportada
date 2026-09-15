/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Código estável do pacote (`CARGO_*_INVALID_DECIMAL_FORMAT`): nunca carrega valor, só a forma. */
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u

/**
 * O empacotador lançou dentro da thread. Só a forma do erro atravessa — a mensagem pode citar o
 * rótulo da parada (`security.md` §1) —, e é essa forma que o log do handler precisa para dizer por quê.
 */
export class CargoLayoutThreadError extends Error {
  override readonly name = 'CargoLayoutThreadError'

  constructor(
    readonly reason: string,
    readonly code: string | undefined,
  ) {
    super('cargo layout thread failed')
  }
}

export function readSafeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const { code } = error
  return typeof code === 'string' && SAFE_ERROR_CODE_PATTERN.test(code) ? code : undefined
}
