/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type DriverOccurrenceEmailSettings = {
  readonly enabled: boolean
  /** Nulo enquanto nenhuma pessoa mudou a configuração. */
  readonly updatedAt: Date | null
}

export type SaveDriverOccurrenceEmailSettingsParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly enabled: boolean
  readonly ipAddress: string
  readonly userId: string
}

/** `save` grava a auditoria na mesma transação, e só quando o valor muda. */
export type DriverOccurrenceEmailSettingsPort = {
  find(params: { readonly companyId: string }): Promise<DriverOccurrenceEmailSettings>
  save(params: SaveDriverOccurrenceEmailSettingsParams): Promise<DriverOccurrenceEmailSettings>
}
