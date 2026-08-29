/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createKeycloakAdminClient,
  type KeycloakAdminClient,
  type KeycloakAdminConfig,
} from '@adatechnology/keycloak-admin'

import type { IdentityRealmPort } from '../application/identity-document.port.js'

export type KeycloakRealmGatewayConfig = {
  readonly clientId: string
  readonly clientSecret: string
  readonly issuer: string
}

export function createKeycloakRealmGateway(
  config: KeycloakRealmGatewayConfig,
  createClient: (config: KeycloakAdminConfig) => KeycloakAdminClient = (adminConfig) =>
    createKeycloakAdminClient({ config: adminConfig }),
): IdentityRealmPort {
  const client = createClient(toAdminConfig(config))

  return {
    async listUsers({ first, limit }) {
      const page = await client.listUsers({ first, limit })
      return {
        hasMore: page.hasMore,
        users: page.users.map((user) => ({
          attributes: user.attributes ?? {},
          subject: user.id,
        })),
      }
    },
    updateAttributes: (input) => client.updateAttributes(input),
  }
}

function toAdminConfig({
  clientId,
  clientSecret,
  issuer,
}: KeycloakRealmGatewayConfig): KeycloakAdminConfig {
  const { baseUrl, realm } = parseIssuer(issuer)
  return { baseUrl, clientId, clientSecret, realm }
}

/** O Admin API separa `baseUrl` de `realm`; o issuer do JWT já carrega os dois combinados. */
function parseIssuer(issuer: string): { readonly baseUrl: string; readonly realm: string } {
  const url = new URL(issuer)
  const segments = url.pathname.split('/').filter((segment) => segment !== '')
  const realm = segments.at(-1)
  if (realm === undefined) throw new TypeError('KEYCLOAK_ISSUER sem realm no caminho')
  return { baseUrl: url.origin, realm }
}
