/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 322: a empresa liga ou desliga o e-mail do aviso da ocorrência que o motorista registra.
 */
import type {
  DriverOccurrenceEmailSettings,
  DriverOccurrenceEmailSettingsPort,
  SaveDriverOccurrenceEmailSettingsParams,
} from './driver-occurrence-email-settings.port.js'

type Dependencies = { readonly settings: DriverOccurrenceEmailSettingsPort }

export function createGetDriverOccurrenceEmailSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (params: {
    readonly companyId: string
  }) => Promise<DriverOccurrenceEmailSettings>
} {
  return { execute: (params) => dependencies.settings.find({ companyId: params.companyId }) }
}

export function createSaveDriverOccurrenceEmailSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SaveDriverOccurrenceEmailSettingsParams,
  ) => Promise<DriverOccurrenceEmailSettings>
} {
  return { execute: (params) => dependencies.settings.save(params) }
}
