/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  parseLoginIdentifier,
  resolveLoginHint,
  type LoginHintResolution,
} from '../domain/login-identifier.policy.js'
import type { LoginIdentifierRepositoryPort } from './login-identifier.port.js'

type ResolveLoginHintDependencies = {
  readonly repository: LoginIdentifierRepositoryPort
}

export type ResolveLoginHintUseCase = {
  execute(input: { readonly typed: string }): Promise<LoginHintResolution>
}

/**
 * A primeira etapa do login: a pessoa digita o que lembra — e-mail, CPF, CNPJ ou telefone — e nós
 * dizemos ao provedor **qual login** é aquele. O Keycloak encontra alguém por `username` ou pelo
 * campo `email`, e só; documento e telefone ele não sabe procurar de jeito nenhum.
 *
 * A senha nunca passa por aqui. Esta etapa resolve **quem é**, e o resto do login continua sendo
 * entre a pessoa e o provedor — é o que preserva o PKCE e os fluxos que ele medeia.
 */
export function createResolveLoginHintUseCase({
  repository,
}: ResolveLoginHintDependencies): ResolveLoginHintUseCase {
  return {
    async execute({ typed }) {
      const parsed = parseLoginIdentifier(typed)
      /** Não parece nenhum dos três: segue como veio, e o provedor o trata como login comum. */
      if (parsed === undefined) return resolveLoginHint({ candidates: [], typed })

      const candidates = await repository.findByIdentifier(parsed)
      return resolveLoginHint({ candidates, typed })
    },
  }
}
