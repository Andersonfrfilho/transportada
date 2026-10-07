/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a: os erros do ramo da prévia por e-mail. O de DKIM sem veredito (DNS fora do ar) NÃO é
 * recusa: sobe para a fila repetir a entrega, e só a última tentativa grava a recusa.
 */
export class CargoPreviewEmailDkimUnverifiableError extends Error {
  public constructor() {
    super('forwarder dkim could not be verified; the delivery will be retried')
    this.name = 'CargoPreviewEmailDkimUnverifiableError'
  }
}

export class CargoPreviewEmailInsertReturnedNothingError extends Error {
  public constructor() {
    super('cargo preview insert returned no row')
    this.name = 'CargoPreviewEmailInsertReturnedNothingError'
  }
}

export class CargoPreviewEmailRawObjectNotRecordedError extends Error {
  public constructor() {
    super('raw email object insert returned no row')
    this.name = 'CargoPreviewEmailRawObjectNotRecordedError'
  }
}
