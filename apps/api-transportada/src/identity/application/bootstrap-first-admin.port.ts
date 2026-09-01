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

/**
 * O que a administração de usuários lê para mostrar a pessoa. Nasce do que o arranque já perguntou —
 * não há segunda tela pedindo nome e contato depois, e sem esta linha o administrador da instalação
 * fica invisível na própria tela que ele usa para convidar os outros.
 *
 * A senha não entra aqui e nunca entrará: ela é do provedor de identidade, não do perfil.
 */
export type CreateFirstAdminProfile = {
  readonly contactAddress: string
  readonly contactChannel: 'email'
  readonly email: string
  readonly name: string
  readonly username: string
}

export type CreateFirstAdminInput = {
  readonly companyId: string
  readonly issuer: string
  readonly profile: CreateFirstAdminProfile
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
