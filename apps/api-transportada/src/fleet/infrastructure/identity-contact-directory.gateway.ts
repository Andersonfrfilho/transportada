/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverContactDirectoryPort } from '../application/fleet.port.js'
import type { IdentityAccessGatewayPort } from '../../identity/infrastructure/keycloak-admin.gateway.js'

/**
 * O e-mail do motorista é o login dele, e a unicidade mora no provedor de identidade — a tabela da
 * frota não tem índice para ele. A resposta é booleana de propósito: quem consulta é o formulário,
 * e dizer de quem é o e-mail enumeraria usuário de outra empresa.
 */
export function createIdentityContactDirectoryGateway(dependencies: {
  readonly identity: Pick<IdentityAccessGatewayPort, 'findUserByEmail'>
}): FleetDriverContactDirectoryPort {
  return {
    async isEmailTaken({ email }): Promise<boolean> {
      const found = await dependencies.identity.findUserByEmail({ email })
      return found !== undefined
    },
  }
}
