/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (correção da revisão da Fase 4a, H2): o banco recusou um número da planilha por não caber
 * na coluna (SQLSTATE 22003). O leitor já barra isso por linha; se escapar, é defeito do arquivo —
 * a prévia falha com código, e a mensagem não volta para a fila para sempre.
 */
export class CargoPreviewValueOutOfRangeError extends Error {
  readonly code = 'PREVIEW_VALUE_OUT_OF_RANGE'

  constructor() {
    super('A preview value does not fit its database column')
    this.name = 'CargoPreviewValueOutOfRangeError'
  }
}
