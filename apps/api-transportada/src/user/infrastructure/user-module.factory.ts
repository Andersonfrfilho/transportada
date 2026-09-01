/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createUserModule, type UserModule } from '@adatechnology/user-module'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CreateApiUserModuleParams = {
  readonly accessTokenSecret: string
  /** Grupo de instalação (mesma raiz que a candidatura de agregado usa) — a conta não é multi-empresa. */
  readonly companyId: string
  readonly db: Database
}

function buildUserModule({
  accessTokenSecret,
  companyId,
  db,
}: CreateApiUserModuleParams): Promise<UserModule> {
  return createUserModule({
    config: {
      accessToken: { secret: accessTokenSecret },
      tenancy: { defaultCompanyId: companyId, mode: 'single' },
    },
    db: db as never,
  })
}

type UseCaseLike<TInput, TResult> = { execute(input: TInput): Promise<TResult> }

/**
 * Adia `.execute` até o módulo real resolver, sem adiar `bootstrap()` inteiro — mesmo espírito da
 * fila preguiçosa do RabbitMQ (`createLazyRabbitMqNotificationQueue`): "o `bootstrap()` da API é
 * síncrono; abrir conexão não é". Aqui quem é assíncrono é `createUserModule` (dynamic import
 * condicional do verificador Keycloak), e a tabela de rotas do módulo precisa existir *já*, porque
 * o preflight de CORS lê `router.routes` no boot — antes de qualquer requisição de verdade acontecer.
 */
function lazyUseCase<TInput, TResult>(
  resolve: () => Promise<UserModule>,
  pick: (module: UserModule) => UseCaseLike<TInput, TResult>,
): UseCaseLike<TInput, TResult> {
  return {
    async execute(input) {
      const module = await resolve()
      return pick(module).execute(input)
    },
  }
}

/**
 * Composition root do módulo de conta do agregado (064/T1). `tenancy.mode: 'single'` porque a conta
 * do agregado não pertence a uma empresa operadora — ela é da instalação inteira, a mesma raiz que
 * `landingCompanyId` já usa pra candidatura pública. Sem Keycloak, sem reset de senha por e-mail
 * ainda: essas capacidades entram na Fase 2 (T4) quando a tela de conta existir pra usá-las — o
 * módulo já sabe ficar ausente por capacidade em vez de fingir suporte que ninguém liga ainda, e por
 * isso `hasKeycloak`/`hasPasswordReset`/`hasEmail` são conhecidos de antemão, sem esperar a Promise.
 */
export function createApiUserModule(params: CreateApiUserModuleParams): UserModule {
  let pending: Promise<UserModule> | undefined
  const resolve = (): Promise<UserModule> => (pending ??= buildUserModule(params))

  return {
    hasEmail: false,
    hasKeycloak: false,
    hasPasswordReset: false,
    // As dez classes de `useCases` só são chamadas pelo `.execute()` delas (`http/authRoutes.ts` e
    // `adminRoutes.ts` do módulo nunca fazem `instanceof`) — o `as never` troca o campo privado
    // `dependencies` que o TS exige por nominalidade por um objeto que só implementa o que é
    // realmente invocado. Sem ele, adiar a resolução do módulo (ver `lazyUseCase` acima) seria
    // impossível sem violar `bootstrap()` síncrono.
    useCases: {
      authenticateKeycloak: lazyUseCase(resolve, (module) => module.useCases.authenticateKeycloak),
      authenticateLocal: lazyUseCase(resolve, (module) => module.useCases.authenticateLocal),
      confirmPasswordReset: lazyUseCase(resolve, (module) => module.useCases.confirmPasswordReset),
      createUser: lazyUseCase(resolve, (module) => module.useCases.createUser),
      getProfile: lazyUseCase(resolve, (module) => module.useCases.getProfile),
      listUsers: lazyUseCase(resolve, (module) => module.useCases.listUsers),
      refreshSession: lazyUseCase(resolve, (module) => module.useCases.refreshSession),
      requestPasswordReset: lazyUseCase(resolve, (module) => module.useCases.requestPasswordReset),
      signOut: lazyUseCase(resolve, (module) => module.useCases.signOut),
      updateProfile: lazyUseCase(resolve, (module) => module.useCases.updateProfile),
    } as never,
    async verifyAccessToken(accessToken) {
      const module = await resolve()
      return module.verifyAccessToken(accessToken)
    },
  }
}
