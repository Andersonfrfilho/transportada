/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S2): o vínculo de uma prévia passou do orçamento. Ele
 * roda sob a trava advisory do contratante; parar é soltar a trava, não esperar.
 */
export class CargoPreviewMatchTimeoutError extends Error {
  readonly code = 'PREVIEW_MATCH_TIMEOUT'

  constructor() {
    super('Matching a preview took longer than allowed')
    this.name = 'CargoPreviewMatchTimeoutError'
  }
}
