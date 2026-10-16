/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 268: o SMTP do sandbox não aceitou nenhum destinatário — falha permanente, não adianta tentar de novo. */
export class SandboxSmtpRecipientsRejectedError extends Error {
  public constructor() {
    super('The sandbox SMTP server rejected every recipient')
    this.name = 'SandboxSmtpRecipientsRejectedError'
  }
}
