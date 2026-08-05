/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createKeycloakAdminClient,
  type KeycloakAdminClient,
  type KeycloakAdminConfig,
} from '@adatechnology/keycloak-admin'

import type {
  BootstrapIdentityGatewayPort,
  CreateAdministratorInput,
  CreateAdministratorResult,
} from '../application/bootstrap-first-admin.port.js'

type KeycloakAdminGatewayConfig = {
  readonly clientId: string
  readonly clientSecret: string
  readonly issuer: string
}

type KeycloakAdminGatewayDependencies = {
  readonly createClient: (config: KeycloakAdminConfig) => KeycloakAdminClient
}

const defaultDependencies: KeycloakAdminGatewayDependencies = {
  createClient: (config) => createKeycloakAdminClient({ config }),
}

export function createKeycloakAdminGateway(
  config: KeycloakAdminGatewayConfig,
  dependencies: KeycloakAdminGatewayDependencies = defaultDependencies,
): BootstrapIdentityGatewayPort {
  const client = dependencies.createClient(toKeycloakAdminConfig(config))

  return {
    async createAdministrator({
      companyId,
      email,
      firstName,
      lastName,
      password,
      username,
    }: CreateAdministratorInput): Promise<CreateAdministratorResult> {
      const created = await client.createUser({
        attributes: { company_id: companyId },
        email,
        emailVerified: true,
        enabled: true,
        firstName,
        lastName,
        password: { temporary: false, value: password },
        username,
      })

      return { subject: created.id }
    },
  }
}

export type CreateIdentityUserInput = {
  readonly email: string
  readonly enabled: boolean
  readonly username: string
}

export type CreateIdentityUserResult = {
  readonly subject: string
}

export type IdentityAccessGatewayPort = {
  createUser(input: CreateIdentityUserInput): Promise<CreateIdentityUserResult>
  setEnabled(input: { readonly enabled: boolean; readonly userId: string }): Promise<void>
  setPassword(input: {
    readonly password: string
    readonly temporary: boolean
    readonly userId: string
  }): Promise<void>
}

export function createIdentityAccessGateway(
  config: KeycloakAdminGatewayConfig,
  dependencies: KeycloakAdminGatewayDependencies = defaultDependencies,
): IdentityAccessGatewayPort {
  const client = dependencies.createClient(toKeycloakAdminConfig(config))

  return {
    async createUser({ email, enabled, username }): Promise<CreateIdentityUserResult> {
      const created = await client.createUser({ email, emailVerified: false, enabled, username })
      return { subject: created.id }
    },
    async setEnabled({ enabled, userId }): Promise<void> {
      await client.setEnabled({ enabled, userId })
    },
    async setPassword({ password, temporary, userId }): Promise<void> {
      await client.setPassword({ password, temporary, userId })
    },
  }
}

function toKeycloakAdminConfig({
  clientId,
  clientSecret,
  issuer,
}: KeycloakAdminGatewayConfig): KeycloakAdminConfig {
  const { baseUrl, realm } = parseKeycloakIssuer(issuer)
  return { baseUrl, clientId, clientSecret, realm }
}

/** O Admin API separa `baseUrl` de `realm`; o issuer do JWT já carrega os dois combinados. */
function parseKeycloakIssuer(issuer: string): { baseUrl: string; realm: string } {
  const url = new URL(issuer)
  const segments = url.pathname.split('/').filter((segment) => segment !== '')
  const realm = segments.at(-1)
  if (realm === undefined) {
    throw new Error('KEYCLOAK_ISSUER must include a realm segment')
  }

  return { baseUrl: url.origin, realm }
}
