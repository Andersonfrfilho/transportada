/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeviceProfile } from './clientDiagnostics.types'

export type DeviceProfileParams = Readonly<{
  appVersion?: string | undefined
  isStandalone?: boolean | undefined
  navigator: Readonly<{
    connection?:
      Readonly<{ effectiveType?: string | undefined; saveData?: boolean | undefined }> | undefined
    deviceMemory?: number | undefined
    hardwareConcurrency?: number | undefined
  }>
}>

/** Spec 254 RF3: só o que o navegador expõe — campo ausente fica ausente, nunca inventado. */
export function buildDeviceProfile(params: DeviceProfileParams): DeviceProfile {
  const { appVersion, isStandalone, navigator: browser } = params
  return {
    ...(appVersion === undefined ? {} : { appVersion }),
    ...(browser.deviceMemory === undefined ? {} : { deviceMemoryGb: browser.deviceMemory }),
    ...(browser.connection?.effectiveType === undefined
      ? {}
      : { effectiveType: browser.connection.effectiveType }),
    ...(browser.hardwareConcurrency === undefined
      ? {}
      : { hardwareConcurrency: browser.hardwareConcurrency }),
    ...(isStandalone === undefined ? {} : { isStandalone }),
    ...(browser.connection?.saveData === undefined
      ? {}
      : { saveData: browser.connection.saveData }),
  }
}
