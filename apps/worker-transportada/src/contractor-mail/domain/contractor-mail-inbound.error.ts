/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão do `architect` (T010): a empresa do envelope não ter `contractor_mail_settings` era um
 * `Error` genérico, e o consumidor o tratava como falha transitória (retry) — mas reentregar não
 * conserta uma configuração que não existe. É permanente, como a chave do Resend recusada.
 */
export class ContractorMailInboundSettingsMissingError extends Error {
  public constructor(companyId: string) {
    super(`contractor mail settings were not found for company ${companyId}`)
    this.name = 'ContractorMailInboundSettingsMissingError'
  }
}
