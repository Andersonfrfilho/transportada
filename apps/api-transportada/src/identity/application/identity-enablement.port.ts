/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A fatia do provedor de identidade que a administração de usuários precisa: habilitar e
 * desabilitar. Os use-cases dependem deste contrato, nunca do cliente do Keycloak.
 */
export type IdentityEnablementGatewayPort = {
  setEnabled(input: { readonly enabled: boolean; readonly userId: string }): Promise<void>
}
