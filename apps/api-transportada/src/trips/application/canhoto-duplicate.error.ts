/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 C5: a mesma imagem chegou como canhoto por dois caminhos ao mesmo tempo. A transação que gravaria o
 * segundo acha o primeiro sob a trava do hash e desiste; o caso de uso responde `duplicate`, como na conferência de
 * antes da gravação.
 */
import type { AttachedCanhoto } from './canhoto-attachment.types.js'

export class CanhotoDuplicateError extends Error {
  public override readonly name = 'CanhotoDuplicateError'

  public constructor(public readonly found: AttachedCanhoto) {
    super('CANHOTO_DUPLICATE')
  }
}
