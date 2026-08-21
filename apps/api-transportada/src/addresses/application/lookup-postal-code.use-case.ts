/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type PostalCodeSuggestion,
  isCompletePostalCodeSuggestion,
  parsePostalCode,
} from '../domain/postal-code-suggestion.policy.js'
import type { PostalCodeDirectoryPort, PostalCodeProviderPort } from './postal-code.port.js'

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
 * A escada tem três degraus e o último é o teclado do operador. O banco da instalação vem primeiro
 * porque é dado nosso e não custa chamada externa; o provedor público só é consultado quando a casa
 * não soube o endereço **inteiro** — parar numa resposta parcial deixaria o logradouro em branco
 * tendo quem soubesse. Ninguém sabendo, a resposta é vazia: a busca é conveniência, e cadastro não
 * para porque um CEP não foi achado.
 */
export function createLookupPostalCodeUseCase({
  directory,
  provider,
}: CreateLookupPostalCodeUseCaseParams): LookupPostalCodeUseCase {
  return {
    execute: async ({ companyId, postalCode }) => {
      const canonical = parsePostalCode(postalCode)
      const local = await directory.findByPostalCode({ companyId, postalCode: canonical })
      if (isCompletePostalCodeSuggestion(local)) {
        return local
      }

      // O parcial de casa fica guardado e só responde quando nem a BrasilAPI nem o ViaCEP souberam
      return (await provider.findByPostalCode({ postalCode: canonical })) ?? local
    },
  }
}
