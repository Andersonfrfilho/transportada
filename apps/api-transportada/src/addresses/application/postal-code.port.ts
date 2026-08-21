/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PostalCodeSuggestion } from '../domain/postal-code-suggestion.policy.js'

export type PostalCodeQuery = {
  readonly companyId: string
  readonly postalCode: string
}

/**
 * O que o banco da instalação sabe sobre um CEP. Devolver `null` é ausência, não falha: quem decide
 * consultar provedor externo depois disso é o caso de uso.
 */
export type PostalCodeDirectoryPort = {
  findByPostalCode(query: PostalCodeQuery): Promise<PostalCodeSuggestion | null>
}

/** O provedor externo não recebe `companyId`: de quem é o CEP é assunto nosso, não dele. */
export type PostalCodeProviderQuery = {
  readonly postalCode: string
}

/**
 * O que um provedor público sabe sobre um CEP. Aqui `null` cobre ausência **e** falha: provedor fora
 * do ar não é defeito nosso, e a resposta do caso de uso é a mesma — o operador digita.
 */
export type PostalCodeProviderPort = {
  findByPostalCode(query: PostalCodeProviderQuery): Promise<PostalCodeSuggestion | null>
}
