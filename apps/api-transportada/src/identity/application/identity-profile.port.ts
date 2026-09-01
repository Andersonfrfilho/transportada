/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A fatia do provedor de identidade que a edição de perfil precisa: e-mail, nome e login. Os
 * use-cases dependem deste contrato, nunca do cliente do Keycloak.
 */
export type IdentityProfileGatewayPort = {
  /**
   * O atributo é substituído inteiro pelo Admin API, então quem chama manda o conjunto que quer
   * ver gravado — mandar só o documento apagaria o `company_id` e o login entraria sem empresa.
   */
  updateAttributes(input: {
    readonly attributes: Readonly<Record<string, string | readonly string[]>>
    readonly userId: string
  }): Promise<void>
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
