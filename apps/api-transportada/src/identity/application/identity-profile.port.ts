/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A fatia do provedor de identidade que a edição de perfil precisa: e-mail, nome e login. Os
 * use-cases dependem deste contrato, nunca do cliente do Keycloak.
 */
export type IdentityProfileGatewayPort = {
  updateUser(input: {
    readonly user: Readonly<
      Partial<{
        email: string
        emailVerified: boolean
        firstName: string
        lastName: string
        username: string
      }>
    >
    readonly userId: string
  }): Promise<void>
}
