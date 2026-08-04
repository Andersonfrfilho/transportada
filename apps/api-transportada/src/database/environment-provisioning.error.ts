/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const ENVIRONMENT_PROVISIONING_CONFIGURATION_CODES = [
  'DATABASE_URL_INVALID',
  'KEYCLOAK_ISSUER_INVALID',
  'PROVISION_ADMIN_SUBJECT_INVALID',
  'PROVISION_COMPANY_ID_INVALID',
] as const

export type EnvironmentProvisioningConfigurationCode =
  (typeof ENVIRONMENT_PROVISIONING_CONFIGURATION_CODES)[number]

/** A mensagem carrega só o nome da variável: o valor recusado pode ser um segredo. */
export class EnvironmentProvisioningConfigurationError extends Error {
  public override readonly name = 'EnvironmentProvisioningConfigurationError'
  public readonly code: EnvironmentProvisioningConfigurationCode

  public constructor(code: EnvironmentProvisioningConfigurationCode) {
    super(`Environment provisioning configuration is incomplete or invalid: ${code}`)
    this.code = code
  }
}

export class EnvironmentProvisioningConflictError extends Error {
  public override readonly name = 'EnvironmentProvisioningConflictError'

  public constructor(entity: string) {
    super(`Environment provisioning conflicts with the existing ${entity}`)
  }
}
