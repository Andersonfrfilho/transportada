/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createKeycloakAdminClient,
  isKeycloakAdminError,
  KEYCLOAK_ADMIN_ERROR_CODE,
  type KeycloakAdminClient,
  type KeycloakAdminConfig,
} from '@adatechnology/keycloak-admin'

import {
  DuplicateContactError,
  DuplicateUsernameError,
  UsernameChangeRefusedError,
} from '../domain/company-user.error.js'
import { IDENTITY_USER_ATTRIBUTE } from '../domain/identity-attribute.constant.js'

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

export type IdentityUserAttributes = Readonly<Record<string, string | readonly string[]>>

/** O Keycloak devolve atributo como lista, mesmo quando o valor é um só. */
function readAttribute(attributes: IdentityUserAttributes | undefined, name: string): string {
  const value = attributes?.[name]
  if (value === undefined) return ''
  return (Array.isArray(value) ? (value.at(0) ?? '') : String(value)).trim()
}

export type CreateIdentityUserInput = {
  readonly attributes?: IdentityUserAttributes
  readonly email: string
  readonly enabled: boolean
  readonly firstName?: string
  readonly lastName?: string
  readonly username: string
}

export type CreateIdentityUserResult = {
  readonly subject: string
}

export type IdentityUserProfilePatch = Readonly<
  Partial<{
    email: string
    emailVerified: boolean
    firstName: string
    lastName: string
    username: string
  }>
>

export type FindIdentityUserResult = {
  readonly subject: string
  readonly username: string | undefined
}

export type ListIdentityUsersInput = {
  readonly first?: number
  readonly limit?: number
  readonly search?: string
}

/**
 * O realm é a segunda metade da reconciliação. `taxId` sai do atributo do usuário e hoje vem vazio
 * — o produto só grava `company_id` —, e a política de casamento trata chave vazia como ausência.
 */
export type ListedIdentityUser = {
  readonly email: string
  readonly enabled: boolean
  readonly subject: string
  readonly taxId: string
  readonly username: string
}

export type ListIdentityUsersResult = {
  readonly hasMore: boolean
  readonly users: readonly ListedIdentityUser[]
}

/**
 * O grupo do realm. O `groupId` aqui é **do Keycloak**, nunca o nosso: são espaços de identificador
 * diferentes, e trocá-los monta chamada que o provedor aceita contra um grupo que não é o nosso.
 */
export type IdentityGroupGatewayPort = {
  addMember(input: { readonly groupId: string; readonly subject: string }): Promise<void>
  createGroup(input: { readonly name: string }): Promise<{ readonly groupId: string }>
  deleteGroup(input: { readonly groupId: string }): Promise<void>
  removeMember(input: { readonly groupId: string; readonly subject: string }): Promise<void>
  renameGroup(input: { readonly groupId: string; readonly name: string }): Promise<void>
}

export type IdentityAccessGatewayPort = {
  createUser(input: CreateIdentityUserInput): Promise<CreateIdentityUserResult>
  deleteUser(input: { readonly userId: string }): Promise<void>
  findUserByEmail(input: { readonly email: string }): Promise<FindIdentityUserResult | undefined>
  listUsers(input?: ListIdentityUsersInput): Promise<ListIdentityUsersResult>
  setEnabled(input: { readonly enabled: boolean; readonly userId: string }): Promise<void>
  setPassword(input: {
    readonly password: string
    readonly temporary: boolean
    readonly userId: string
  }): Promise<void>
  setTemporaryPassword(input: { readonly password: string; readonly userId: string }): Promise<void>
  /** A URL da foto vai para o atributo `picture`, o nome que o OIDC reserva. */
  setProfilePicture(input: {
    readonly pictureUrl: string | undefined
    readonly userId: string
  }): Promise<void>
  updateAttributes(input: {
    readonly attributes: IdentityUserAttributes
    readonly userId: string
  }): Promise<void>
  updateUser(input: {
    readonly user: IdentityUserProfilePatch
    readonly userId: string
  }): Promise<void>
}

export function createIdentityAccessGateway(
  config: KeycloakAdminGatewayConfig,
  dependencies: KeycloakAdminGatewayDependencies = defaultDependencies,
): IdentityAccessGatewayPort {
  const client = dependencies.createClient(toKeycloakAdminConfig(config))

  return {
    async createUser(input): Promise<CreateIdentityUserResult> {
      const created = await guardContact(() =>
        client.createUser({
          ...omitUndefined({
            attributes: input.attributes,
            firstName: input.firstName,
            lastName: input.lastName,
          }),
          email: input.email,
          emailVerified: false,
          enabled: input.enabled,
          username: input.username,
        }),
      )
      return { subject: created.id }
    },
    async setProfilePicture({ pictureUrl, userId }): Promise<void> {
      await client.setProfilePicture({ pictureUrl, userId })
    },
    async deleteUser({ userId }): Promise<void> {
      await client.deleteUser({ userId })
    },
    async findUserByEmail({ email }): Promise<FindIdentityUserResult | undefined> {
      const found = await client.findUserByEmail({ email })
      return found === undefined ? undefined : { subject: found.id, username: found.username }
    },
    async listUsers(input = {}): Promise<ListIdentityUsersResult> {
      const page = await client.listUsers(input)
      return {
        hasMore: page.hasMore,
        users: page.users.map((user) => ({
          email: user.email ?? '',
          enabled: user.enabled ?? false,
          subject: user.id,
          taxId: readAttribute(user.attributes, IDENTITY_USER_ATTRIBUTE.TAX_ID),
          username: user.username ?? '',
        })),
      }
    },
    async setEnabled({ enabled, userId }): Promise<void> {
      await client.setEnabled({ enabled, userId })
    },
    async setPassword({ password, temporary, userId }): Promise<void> {
      await client.setPassword({ password, temporary, userId })
    },
    async setTemporaryPassword({ password, userId }): Promise<void> {
      await client.setTemporaryPassword({ password, userId })
    },
    async updateAttributes({ attributes, userId }): Promise<void> {
      await client.updateAttributes({ attributes, userId })
    },
    async updateUser({ user, userId }): Promise<void> {
      await guardProfileUpdate(
        () => client.updateUser({ user, userId }),
        user.username !== undefined,
      )
    },
  }
}

/**
 * O e-mail é único no realm, e quem descobre a colisão é o Keycloak. Sem esta tradução o 409 dele
 * chega ao cliente como 500 genérico, e o formulário não tem em que campo ancorar a mensagem.
 */
async function guardContact<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (isKeycloakAdminError(error) && error.code === KEYCLOAK_ADMIN_ERROR_CODE.USER_ALREADY_EXISTS)
      throw new DuplicateContactError()
    throw error
  }
}

/**
 * A única operação do gateway que não traduzia recusa nenhuma — e por isso toda negativa do provedor
 * chegava à tela como "não foi possível concluir a operação", sem dizer em que campo mexer.
 *
 * A troca de login é o caso que dói: `editUsernameAllowed` é **desligado por padrão** no Keycloak, e
 * ali a recusa é de configuração do realm, não do dado digitado — repetir o pedido nunca converge.
 * Ela é reconhecida pela combinação "mandamos login **e** o provedor devolveu 400", e não pelo texto
 * da mensagem, que muda com a versão e com o idioma do servidor.
 */
async function guardProfileUpdate<TResult>(
  operation: () => Promise<TResult>,
  hasUsername: boolean,
): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (!isKeycloakAdminError(error)) throw error

    /** O mesmo código cobre os dois campos únicos do realm; quem separa é o que foi enviado. */
    if (error.code === KEYCLOAK_ADMIN_ERROR_CODE.USER_ALREADY_EXISTS) {
      throw hasUsername ? new DuplicateUsernameError() : new DuplicateContactError()
    }
    if (
      hasUsername &&
      error.code === KEYCLOAK_ADMIN_ERROR_CODE.REQUEST_FAILED &&
      error.status === HTTP_BAD_REQUEST
    ) {
      throw new UsernameChangeRefusedError()
    }
    throw error
  }
}

/** O provedor recusa a troca de login com 400, não com 409: não é colisão, é regra do realm. */
const HTTP_BAD_REQUEST = 400

/** O Admin API sobrescreve o campo enviado: mandar `undefined` apagaria o que já está lá. */
function omitUndefined<TValue extends Record<string, unknown>>(value: TValue): Partial<TValue> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<TValue>
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

/**
 * A ponte entre o grupo daqui e o grupo do realm. Ela não decide nada: quem decide o que fazer com a
 * falha é o caso de uso, que trata provedor fora do ar como "sincronização pendente" em vez de
 * recusar a operação inteira.
 */
export function createIdentityGroupGateway(
  config: KeycloakAdminGatewayConfig,
  dependencies: KeycloakAdminGatewayDependencies = defaultDependencies,
): IdentityGroupGatewayPort {
  const client = dependencies.createClient(toKeycloakAdminConfig(config))

  return {
    addMember: ({ groupId, subject }) => client.addUserToGroup({ groupId, userId: subject }),
    async createGroup({ name }) {
      const created = await client.createGroup({ name })
      return { groupId: created.id }
    },
    deleteGroup: ({ groupId }) => client.deleteGroup({ groupId }),
    removeMember: ({ groupId, subject }) =>
      client.removeUserFromGroup({ groupId, userId: subject }),
    renameGroup: ({ groupId, name }) => client.updateGroup({ group: { name }, groupId }),
  }
}
