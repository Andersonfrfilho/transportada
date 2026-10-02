/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** A thread de decodificação passou do orçamento e foi encerrada: falha de infraestrutura, não leitura. */
export class CanhotoDecodeTimeoutError extends Error {
  override readonly name = 'CanhotoDecodeTimeoutError'

  constructor() {
    super('canhoto decode thread exceeded its budget')
  }
}
