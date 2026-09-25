/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type PostalCodeSuggestion,
  parsePostalCode,
} from '../domain/postal-code-suggestion.policy.js'
import type { PostalCodeDirectoryPort, PostalCodeProviderPort } from './postal-code.port.js'
import { raceCompletePostalCodeSuggestion } from './postal-code-race.service.js'

export type LookupPostalCodeRequest = {
  readonly companyId: string
  readonly postalCode: string
}

export type LookupPostalCodeUseCase = {
  readonly execute: (request: LookupPostalCodeRequest) => Promise<PostalCodeSuggestion | null>
}

export type CreateLookupPostalCodeUseCaseParams = {
  readonly directory: PostalCodeDirectoryPort
  readonly provider: PostalCodeProviderPort
}

/**
 * Banco da instalação e provedor público correm juntos (spec 186): esperar o banco antes de perguntar
 * fora punha a BrasilAPI inteira — ~2 s quando ela resolve coordenada — na frente do operador. Vence
 * a primeira resposta **completa**; parcial não vence, porque parar na UF deixaria o logradouro em
 * branco tendo quem soubesse. Ninguém sabendo, a resposta é vazia e o operador digita.
 */
export function createLookupPostalCodeUseCase({
  directory,
  provider,
}: CreateLookupPostalCodeUseCaseParams): LookupPostalCodeUseCase {
  return {
    execute: async ({ companyId, postalCode }) => {
      const canonical = parsePostalCode(postalCode)

      // O provedor vem antes na lista porque, entre parciais, ele sabe mais que o banco
      return raceCompletePostalCodeSuggestion([
        () => provider.findByPostalCode({ postalCode: canonical }),
        () => directory.findByPostalCode({ companyId, postalCode: canonical }),
      ])
    },
  }
}
