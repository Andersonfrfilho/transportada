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
  'driver',
  /** ADR-0047 §2: o papel do service account. É por ele que a API reconhece o serviço. */
  'transportada-service',
]
const ADMIN_CLIENT_ID = 'transportada-admin'
const ADMIN_CLIENT_SECRET_PLACEHOLDER = '${KEYCLOAK_ADMIN_CLIENT_SECRET}'
const WORKER_CLIENT_SECRET_PLACEHOLDER = '${KEYCLOAK_WORKER_CLIENT_SECRET}'
const REALM_MANAGEMENT_CLIENT = 'realm-management'
const MANAGE_REALM_ROLE = 'manage-realm'
const MANAGE_USERS_ROLE = 'manage-users'
const LOCAL_REALM_PATH = 'realm/transportada-local-realm.json'
const DEPLOY_REALM_PATH = 'deploy/keycloak/realm.json'

/**
 * `manage-users` é o que a API precisa em toda instalação. `manage-realm` existe só no realm
 * publicado: `--import-realm` ignora realm que já subiu, então o passo "Reconciliar realm" do
 * deploy aplica o `loginTheme` com esta mesma credencial — sem o papel, o tema nunca alcança um
 * ambiente existente. O realm local não reconcilia nada, nasce do arquivo a cada container, e por
 * isso continua no mínimo. A lista é exaustiva nos dois: papel a mais aqui é privilégio a mais lá.
 */
const SERVICE_ACCOUNT_CLIENT_ROLES: Readonly<Record<string, readonly string[]>> = {
  [DEPLOY_REALM_PATH]: [MANAGE_REALM_ROLE, MANAGE_USERS_ROLE],
  [LOCAL_REALM_PATH]: [MANAGE_USERS_ROLE],
}
const ENVIRONMENT_PLACEHOLDER = /^\$\{[A-Z0-9_]+\}$/
const THEME_NAME = 'transportada'
const THEME_ROOT = 'deploy/keycloak/theme'
const THEME_PATH = `${THEME_ROOT}/login`

type KeycloakRealm = {
  readonly clients: readonly KeycloakClient[]
  readonly loginTheme?: string
  readonly realm: string
  readonly roles: {
    readonly realm: readonly { readonly name: string }[]
  }
  readonly editUsernameAllowed?: boolean
  readonly resetPasswordAllowed: boolean
  readonly sslRequired: string
  readonly users: readonly KeycloakUser[]
}

type KeycloakClient = {
  readonly attributes?: Readonly<Record<string, string>>
  readonly clientAuthenticatorType?: string
  readonly clientId: string
  readonly directAccessGrantsEnabled: boolean
  readonly implicitFlowEnabled: boolean
  readonly protocolMappers?: readonly KeycloakProtocolMapper[]
  readonly publicClient: boolean
  readonly redirectUris?: readonly string[]
  readonly secret?: string
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
  readonly attributes?: Readonly<Record<string, readonly string[]>>
  readonly clientRoles?: Readonly<Record<string, readonly string[]>>
  readonly credentials?: readonly KeycloakCredential[]
  readonly email?: string
  readonly emailVerified?: boolean
  readonly enabled?: boolean
  readonly firstName?: string
  readonly id?: string
  readonly lastName?: string
  readonly realmRoles?: readonly string[]
  readonly requiredActions?: readonly string[]
  readonly serviceAccountClientId?: string
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
  return JSON.parse(await readProjectFile(LOCAL_REALM_PATH)) as KeycloakRealm
}

async function readEveryRealm(): Promise<readonly KeycloakRealm[]> {
  return (await readEveryRealmFile()).map((entry) => entry.realm)
}

async function readEveryRealmFile(): Promise<
  readonly { readonly filePath: string; readonly realm: KeycloakRealm }[]
> {
  const filePaths = [LOCAL_REALM_PATH, DEPLOY_REALM_PATH]
  const files = await Promise.all(filePaths.map(readProjectFile))

  return files.map((file, index) => ({
    filePath: filePaths[index] as string,
    realm: JSON.parse(file) as KeycloakRealm,
  }))
}

/**
 * Segredo literal em realm versionado é segredo queimado — o arquivo vai para o git.
 */
function collectSecretValues(value: unknown, key?: string): readonly string[] {
  if (typeof value === 'string') return key === 'secret' ? [value] : []
  if (Array.isArray(value)) return value.flatMap((item) => collectSecretValues(item, key))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([childKey, child]) =>
      collectSecretValues(child, childKey),
    )
  }

  return []
}

function findClient(realm: KeycloakRealm, clientId: string): KeycloakClient {
  const client = realm.clients.find((candidate) => candidate.clientId === clientId)

  if (client === undefined) {
    throw new Error(`Expected the ${clientId} client in the local realm`)
  }

  return client
}

function findMapper(client: KeycloakClient, name: string): KeycloakProtocolMapper {
  const mapper = client.protocolMappers?.find((candidate) => candidate.name === name)

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
      // ADR-0044 §2: a matriz de estrada é nossa, e ela responde só para a máquina local
      '127.0.0.1:${OSRM_PORT:-53005}:5000',
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
    /**
     * ⚠️ **Duas origens no mesmo cliente SPA: o painel e o portal do contratante.** A ADR-0050 §1
     * faz do portal uma app própria — build, bundle e domínio separados —, mas ela entra pelo
     * **mesmo** realm e pelo mesmo cliente público: quem separa os dois é o papel `contractor` e o
     * vínculo em `contractor_portal_bindings`, não uma segunda identidade.
     *
     * ⚠️ Este contrato ficou desatualizado por uma sessão inteira: as origens do portal entraram no
     * realm sem passar por aqui, e o `gate / integration` reprovou em todo push desde então. A lista
     * é dita por extenso de propósito — origem nova em cliente público é permissão de rede, e
     * precisa de alguém escrevendo que a quis.
     */
    expect(spaClient.attributes?.['post.logout.redirect.uris']).toBe(
      'http://localhost:53000/*##http://localhost:53000##http://localhost:53100/*##http://localhost:53100',
    )
    expect(spaClient.redirectUris).toEqual([
      'http://localhost:53000/auth/callback',
      'http://localhost:53100/auth/callback',
    ])
    expect(spaClient.webOrigins).toEqual(['http://localhost:53000', 'http://localhost:53100'])
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
    expect(localUser?.attributes?.company_id).toEqual(['00000000-0000-4000-8000-000000000001'])
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

describe('Keycloak Admin API service account contract', () => {
  test('both realms ship the same confidential client, usable only as a service account', async () => {
    for (const realm of await readEveryRealm()) {
      const adminClient = findClient(realm, ADMIN_CLIENT_ID)

      expect(adminClient).toMatchObject({
        directAccessGrantsEnabled: false,
        implicitFlowEnabled: false,
        publicClient: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
      })
      expect(adminClient.clientAuthenticatorType).toBe('client-secret')
      expect(adminClient.redirectUris ?? []).toEqual([])
      expect(adminClient.webOrigins ?? []).toEqual([])
    }
  })

  test('grants the service account exactly the realm-management roles each realm needs', async () => {
    for (const { filePath, realm } of await readEveryRealmFile()) {
      const serviceAccount = realm.users.find(
        (candidate) => candidate.serviceAccountClientId === ADMIN_CLIENT_ID,
      )

      expect(serviceAccount?.username).toBe(`service-account-${ADMIN_CLIENT_ID}`)
      expect(serviceAccount?.enabled).toBe(true)
      expect(serviceAccount?.clientRoles).toEqual({
        [REALM_MANAGEMENT_CLIENT]: SERVICE_ACCOUNT_CLIENT_ROLES[filePath] as readonly string[],
      })
      expect(serviceAccount?.realmRoles ?? []).toEqual([])
      expect(serviceAccount?.credentials ?? []).toEqual([])
    }
  })

  test('keeps every client secret as an environment placeholder, never a literal', async () => {
    for (const realm of await readEveryRealm()) {
      const secrets = collectSecretValues(realm)

      expect(secrets).toEqual([ADMIN_CLIENT_SECRET_PLACEHOLDER, WORKER_CLIENT_SECRET_PLACEHOLDER])
      for (const secret of secrets) {
        expect(secret).toMatch(ENVIRONMENT_PLACEHOLDER)
      }
    }
  })

  test('declares the service account credentials as environment variables only', async () => {
    const environment = await readProjectFile('.env.example')

    expect(environment).toContain(`KEYCLOAK_ADMIN_CLIENT_ID=${ADMIN_CLIENT_ID}`)
    expect(environment).toContain(
      'KEYCLOAK_ADMIN_CLIENT_SECRET=replace-with-local-admin-client-secret',
    )
  })
})

describe('Keycloak login theme contract', () => {
  test('both realms wear the application theme and keep Keycloak out of the reset flow', async () => {
    const realms = await readEveryRealm()

    for (const realm of realms) {
      expect(realm.loginTheme).toBe(THEME_NAME)
      expect(realm.resetPasswordAllowed).toBe(false)
    }
  })

  /**
   * O tema desce até `base` e traz os próprios templates: herdar `keycloak.v2` traria o PatternFly
   * inteiro junto, e sobrescrever a folha de outro design system custa mais que escrever a nossa.
   */
  test('owns its templates on top of the bare base theme', async () => {
    const properties = await readProjectFile(`${THEME_PATH}/theme.properties`)
    const template = await readProjectFile(`${THEME_PATH}/login.ftl`)

    expect(properties).toContain('parent=base')
    expect(properties).toContain('styles=css/login.css')
    expect(properties).toContain('scripts=js/password-reset-link.js')
    expect(template).toContain('data-password-reset')
  })

  /**
   * O link nasce escondido: sem origem confiável para resolver, ele fica fora da tela em vez de
   * levar o operador para lugar nenhum.
   */
  test('hides the forgotten-password link until the script resolves its address', async () => {
    const template = await readProjectFile(`${THEME_PATH}/login.ftl`)
    const script = await readProjectFile(`${THEME_PATH}/resources/js/password-reset-link.js`)

    expect(template).toContain('data-password-reset hidden')
    expect(script).toContain('link.hidden = false')
  })

  /**
   * O tema é a única superfície onde a nossa identidade aparece antes da sessão existir: sem token
   * de cor e tipografia iguais aos do app, o usuário vê duas marcas diferentes no mesmo fluxo.
   */
  test('carries the application design tokens', async () => {
    const stylesheet = await readProjectFile(`${THEME_PATH}/resources/css/login.css`)

    for (const token of ['#10222c', '#1c2b33', '#f0f2ee', '#d58a47', '#8fa3ad', 'Avenir Next']) {
      expect(stylesheet).toContain(token)
    }
  })

  /**
   * A tela de login é do Keycloak, a de recuperação é nossa. O link precisa sair da origem que
   * pediu o login — nenhuma URL de frontend fica escrita no tema, que serve todas as instalações.
   */
  test('points the forgotten-password link at our own screen, derived from the caller origin', async () => {
    const script = await readProjectFile(`${THEME_PATH}/resources/js/password-reset-link.js`)

    expect(script).toContain('/recuperar-senha')
    expect(script).toContain('redirect_uri')
    expect(script).not.toContain('http://localhost:53000')
  })

  test('ships the theme to both the local container and the deployed image', async () => {
    const compose = await readProjectFile('compose.yaml')
    const dockerfile = await readProjectFile('deploy/keycloak/Dockerfile')

    expect(compose).toContain(`./${THEME_ROOT}:/opt/keycloak/themes/${THEME_NAME}:ro`)
    expect(dockerfile).toContain(`COPY ${THEME_ROOT} /opt/keycloak/themes/${THEME_NAME}`)
  })
})

/**
 * O login é editável no painel, e quem decide isso é o realm — não a nossa permissão.
 * `editUsernameAllowed` é **desligado por padrão** no Keycloak, e com ele desligado o Admin API
 * recusa a troca com 400: o operador só descobria ao salvar, e o banco já tinha gravado o login novo.
 *
 * Declarar no arquivo não basta: `--import-realm` ignora realm que já existe, então o passo de
 * reconciliação do deploy é o único caminho até um ambiente que já subiu — o mesmo caminho do
 * `loginTheme`, e pela mesma razão.
 */
describe('a troca de login é permitida pelo realm', () => {
  test('os dois realms declaram `editUsernameAllowed`', async () => {
    for (const realm of await readEveryRealm()) {
      expect(realm.editUsernameAllowed).toBe(true)
    }
  })

  test('a reconciliação alcança o realm que já existe', async () => {
    const script = await readProjectFile('.github/scripts/keycloak-reconcile.sh')

    expect(script).toContain('editUsernameAllowed')
    expect(script).toContain('"editUsernameAllowed": true')
  })
})
