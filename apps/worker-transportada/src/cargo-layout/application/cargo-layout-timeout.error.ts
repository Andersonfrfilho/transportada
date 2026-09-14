/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A thread passou do teto externo sem responder — o prazo interno do empacotador não cedeu. Distinto
 * de exceção: numa tentativa não final ele merece o próximo degrau do orçamento (spec 145 D13).
 */
export class CargoLayoutTimeoutError extends Error {
  override readonly name = 'CargoLayoutTimeoutError'

  constructor() {
    super('cargo layout thread exceeded its ceiling')
  }
}
