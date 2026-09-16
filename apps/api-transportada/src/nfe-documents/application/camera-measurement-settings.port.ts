/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * D14: leitura própria do interruptor por empresa, para quem tem `cargo.measure` — não
 * `settings.manage`, que é o de `GET /company-settings/cargo`. Ausência de linha é `false`.
 */
export type CameraMeasurementSettingsPort = {
  readEnabled(input: { readonly companyId: string }): Promise<boolean>
}
