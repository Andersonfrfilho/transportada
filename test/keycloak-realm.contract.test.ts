/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const PROJECT_ROOT = new URL('..', import.meta.url)
const EXPECTED_KEYCLOAK_IMAGE =
  'quay.io/keycloak/keycloak:26.5.2@sha256:fb31a59deb46f746f2aaa25adc5da39ceccac4fd22d36a519562b0bf02e8df20'
const EXPECTED_ROLES = [
  'platform-admin',
  'company-admin',
  'finance',
  'fiscal',
  'operator',
  'viewer',
]

type KeycloakRealm = {
  readonly clients: readonly KeycloakClient[]
  readonly realm: string
  readonly roles: {
    readonly realm: readonly { readonly name: string }[]
  }
  readonly sslRequired: string
  readonly users: readonly KeycloakUser[]
}

type KeycloakClient = {
  readonly attributes?: Readonly<Record<string, string>>
  readonly clientId: string
  readonly directAccessGrantsEnabled: boolean
  readonly implicitFlowEnabled: boolean
  readonly protocolMappers: readonly KeycloakProtocolMapper[]
  readonly publicClient: boolean
  readonly redirectUris?: readonly string[]
  readonly serviceAccountsEnabled: boolean
  readonly standardFlowEnabled: boolean
  readonly webOrigins?: readonly string[]
}

type KeycloakProtocolMapper = {
  readonly config: Readonly<Record<string, string>>
  readonly name: string
  readonly protocolMapper: string
}

type KeycloakUser = {
  readonly attributes: Readonly<Record<string, readonly string[]>>
  readonly credentials: readonly KeycloakCredential[]
  readonly email: string
  readonly emailVerified: boolean
  readonly firstName: string
  readonly id: string
  readonly lastName: string
  readonly realmRoles?: readonly string[]
  readonly requiredActions: readonly string[]
  readonly username: string
}

type KeycloakCredential = {
  readonly temporary: boolean
  readonly type: string
  readonly value: string
}

async function readProjectFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, PROJECT_ROOT)).text()
}

async function readRealm(): Promise<KeycloakRealm> {
  return JSON.parse(await readProjectFile('realm/transportada-local-realm.json')) as KeycloakRealm
}

function findClient(realm: KeycloakRealm, clientId: string): KeycloakClient {
  const client = realm.clients.find((candidate) => candidate.clientId === clientId)

  if (client === undefined) {
    throw new Error(`Expected the ${clientId} client in the local realm`)
  }

  return client
}

function findMapper(client: KeycloakClient, name: string): KeycloakProtocolMapper {
  const mapper = client.protocolMappers.find((candidate) => candidate.name === name)

  if (mapper === undefined) {
    throw new Error(`Expected the ${name} mapper on the ${client.clientId} client`)
  }

  return mapper
}

describe('local Keycloak realm contract', () => {
  test('pins Keycloak and exposes only local identity ports with a healthcheck', async () => {
    const compose = await readProjectFile('compose.yaml')
    const makefile = await readProjectFile('Makefile')

    expect(compose).toContain(`image: ${EXPECTED_KEYCLOAK_IMAGE}`)
    expect(compose).toContain('keycloak:')
    expect(compose).toContain('start-dev --import-realm')
    expect(compose).toContain('healthcheck:')
    expect(compose).toContain('KEYCLOAK_PORT')
    expect(compose).toContain('KEYCLOAK_MANAGEMENT_PORT')
    expect(makefile).toContain('COMPOSE_PROJECT_NAME := $(PROJECT_NAME)-$(APP_ENV)')
    expect(makefile).toContain('realm-contract:')
    expect(makefile).toContain('config: realm-contract')
    expect(makefile).toContain('up: config')
    expect(makefile).toContain('ps: config')
    expect(makefile).toContain('smoke: config')
    expect(makefile).toContain('$(KEYCLOAK_MANAGEMENT_PORT)/health/ready')
    expect(makefile).toContain(
      '$(KEYCLOAK_PORT)/realms/$(KEYCLOAK_REALM)/.well-known/openid-configuration',
    )
  })

  test('binds every published development service port only to loopback', async () => {
    const compose = await readProjectFile('compose.yaml')
    const publishedPorts = [...compose.matchAll(/^\s+- '([^']+:[0-9]+)'$/gm)].map(
      (match) => match[1],
    )

    expect(publishedPorts).toEqual([
      '127.0.0.1:${POSTGRES_PORT:-55432}:5432',
      '127.0.0.1:${RABBITMQ_PORT:-55672}:5672',
      '127.0.0.1:${RABBITMQ_MANAGEMENT_PORT:-55673}:15672',
      '127.0.0.1:${MINIO_PORT:-59000}:9000',
      '127.0.0.1:${MINIO_CONSOLE_PORT:-59001}:9001',
      '127.0.0.1:${MAILPIT_SMTP_PORT:-51025}:1025',
      '127.0.0.1:${MAILPIT_UI_PORT:-58025}:8025',
      '127.0.0.1:${KEYCLOAK_PORT}:8080',
      '127.0.0.1:${KEYCLOAK_MANAGEMENT_PORT}:9000',
    ])
  })

  test('defines trusted local issuer and JWKS configuration without real secrets', async () => {
    const environment = await readProjectFile('.env.example')

    expect(environment).toContain('KEYCLOAK_REALM=transportada-local')
    expect(environment).toContain('PROJECT_NAME=transportada')
    expect(environment).toContain('APP_ENV=local')
    expect(environment).toContain(
      'KEYCLOAK_ISSUER=http://localhost:58080/realms/transportada-local',
    )
    expect(environment).toContain(
      'KEYCLOAK_JWKS_URI=http://localhost:58080/realms/transportada-local/protocol/openid-connect/certs',
    )
    expect(environment).toContain('KEYCLOAK_ADMIN_PASSWORD=replace-with-local-development-password')
    expect(environment).toContain('KEYCLOAK_LOCAL_USER_PASSWORD=replace-with-local-user-password')
  })

  test('imports separate SPA and API clients with Authorization Code plus PKCE S256 only', async () => {
    const realm = await readRealm()
    const spaClient = findClient(realm, 'transportada-spa')
    const apiClient = findClient(realm, 'transportada-api')

    expect(realm.realm).toBe('transportada-local')
    expect(realm.sslRequired).toBe('NONE')
    expect(spaClient).toMatchObject({
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      publicClient: true,
      serviceAccountsEnabled: false,
      standardFlowEnabled: true,
    })
    expect(spaClient.attributes?.['pkce.code.challenge.method']).toBe('S256')
    expect(spaClient.redirectUris).toEqual(['http://localhost:53000/auth/callback'])
    expect(spaClient.webOrigins).toEqual(['http://localhost:53000'])
    expect(apiClient).toMatchObject({
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
      standardFlowEnabled: false,
    })
  })

  test('adds a reproducible API audience, complete local profile, company claim, and roles', async () => {
    const realm = await readRealm()
    const spaClient = findClient(realm, 'transportada-spa')
    const localUser = realm.users.find((candidate) => candidate.username === 'local-user')
    const roleNames = realm.roles.realm.map((role) => role.name).sort()
    const audienceMapper = findMapper(spaClient, 'transportada-api-audience')
    const companyMapper = findMapper(spaClient, 'company-id')

    expect(roleNames).toEqual([...EXPECTED_ROLES].sort())
    expect(audienceMapper).toMatchObject({
      protocolMapper: 'oidc-audience-mapper',
      config: {
        'access.token.claim': 'true',
        'included.client.audience': 'transportada-api',
      },
    })
    expect(companyMapper).toMatchObject({
      protocolMapper: 'oidc-usermodel-attribute-mapper',
      config: {
        'access.token.claim': 'true',
        'claim.name': 'company_id',
        'user.attribute': 'company_id',
      },
    })
    expect(localUser?.id).toBe('00000000-0000-4000-8000-000000000002')
    expect(localUser).toMatchObject({
      email: 'local-user@example.test',
      emailVerified: true,
      firstName: 'Local',
      lastName: 'User',
      requiredActions: [],
    })
    expect(localUser?.attributes.company_id).toEqual(['00000000-0000-4000-8000-000000000001'])
    expect(localUser?.credentials).toEqual([
      {
        temporary: false,
        type: 'password',
        value: '${KEYCLOAK_LOCAL_USER_PASSWORD}',
      },
    ])
    expect(localUser?.realmRoles).toBeUndefined()
  })

  test('bootstraps the local application identity after explicit migrations', async () => {
    const makefile = await readProjectFile('Makefile')
    const seedService = await readProjectFile(
      'apps/api-transportada/src/database/local-identity-seed.service.ts',
    )
    const apiPackage = JSON.parse(await readProjectFile('apps/api-transportada/package.json')) as {
      readonly scripts: Readonly<Record<string, string>>
    }

    expect(apiPackage.scripts['db:seed:local']).toBe(
      'bun src/database/local-identity-seed.service.ts',
    )
    expect(makefile).toContain('identity-bootstrap: postgres-up realm-contract')
    expect(makefile).toContain('dev: identity-bootstrap up')
    expect(makefile).toContain('up -d --wait --force-recreate keycloak')
    expect(makefile).toContain('bun run --cwd apps/api-transportada db:migrate')
    expect(makefile).toContain('bun run --cwd apps/api-transportada db:seed:local')
    expect(makefile).toContain('APP_ENV="$(APP_ENV)"')
    expect(makefile).toContain('PROJECT_NAME="$(PROJECT_NAME)"')
    expect(makefile.indexOf('db:migrate')).toBeLessThan(makefile.indexOf('db:seed:local'))
    expect(seedService).toContain('pg_advisory_xact_lock')
  })
})
