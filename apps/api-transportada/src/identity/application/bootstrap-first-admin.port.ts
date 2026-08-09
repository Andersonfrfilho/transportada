/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type BootstrapAdministratorInput = {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly password: string
  readonly username: string
}

export type BootstrapFirstAdminInput = {
  readonly administrator: BootstrapAdministratorInput
  readonly correlationId: string
}

export type BootstrapFirstAdminResult = {
  readonly companyId: string
  readonly subject: string
  readonly userId: string
}

export type BootstrapAvailability = {
  readonly companyExists: boolean
  readonly hasActiveCompanyAdmin: boolean
}

export type BootstrapPersistedAdmin = {
  readonly membershipId: string
  readonly userId: string
}

export type CreateFirstAdminInput = {
  readonly companyId: string
  readonly issuer: string
  readonly subject: string
}

export type ReadAvailabilityInput = {
  readonly companyId: string
}

export type BootstrapRepositoryPort = {
  createFirstAdmin(input: CreateFirstAdminInput): Promise<BootstrapPersistedAdmin | undefined>
  readAvailability(input: ReadAvailabilityInput): Promise<BootstrapAvailability>
}

export type CreateAdministratorInput = BootstrapAdministratorInput & {
  readonly companyId: string
}

export type CreateAdministratorResult = {
  readonly subject: string
}

export type BootstrapIdentityGatewayPort = {
  createAdministrator(input: CreateAdministratorInput): Promise<CreateAdministratorResult>
}
