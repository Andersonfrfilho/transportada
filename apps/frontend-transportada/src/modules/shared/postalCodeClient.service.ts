/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isCompletePostalCode, stripPostalCode } from './postalCode.service'

const POSTAL_CODES_PATH = '/postal-codes'

/**
 * O que o CEP responde. Número e complemento não vêm de propósito: nas nossas tabelas eles são a
 * casa de alguém, e devolvê-los diria a quem digita quem mora naquele CEP.
 */
export type PostalCodeSuggestion = Readonly<{
  city: string
  district: string
  state: string
  street: string
}>

export type PostalCodeLookupInput = Readonly<{
  postalCode: string
  signal: AbortSignal
}>

export type PostalCodeClient = Readonly<{
  lookup: (input: PostalCodeLookupInput) => Promise<PostalCodeSuggestion | null>
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSuggestion(payload: unknown): PostalCodeSuggestion | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const suggestion = {
    city: readText(payload.data.city),
    district: readText(payload.data.district),
    state: readText(payload.data.state).toUpperCase(),
    street: readText(payload.data.street),
  }
  const hasAnyField =
    suggestion.city !== '' ||
    suggestion.district !== '' ||
    suggestion.state !== '' ||
    suggestion.street !== ''

  return hasAnyField ? suggestion : null
}

/**
 * A escada inteira — nossas tabelas em corrida, depois BrasilAPI e ViaCEP — mora atrás desta rota.
 * `404` é o "ninguém soube", e ele chega aqui como vazio porque o próximo passo é o mesmo que o de
 * uma rota fora do ar: o operador digita o endereço. Só o abort é repassado, senão a resposta do
 * pedido antigo passaria pela guarda de corrida como se fosse a do CEP que está na tela.
 */
export function createPostalCodeClient(dependencies: ClientDependencies): PostalCodeClient {
  return {
    lookup: async ({ postalCode, signal }) => {
      if (!isCompletePostalCode(postalCode)) return null
      const digits = stripPostalCode(postalCode)
      const accessToken = await dependencies.getAccessToken()

      try {
        const response = await dependencies.fetch(
          new Request(`${dependencies.apiUrl}${POSTAL_CODES_PATH}/${digits}`, {
            cache: 'no-store',
            headers: { authorization: `Bearer ${accessToken}` },
            method: 'GET',
            signal,
          }),
        )
        if (!response.ok) return null

        return readSuggestion(await response.json())
      } catch (error) {
        if (signal.aborted) throw error
        return null
      }
    },
  }
}
