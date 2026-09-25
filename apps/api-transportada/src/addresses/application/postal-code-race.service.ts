/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type PostalCodeSuggestion,
  isCompletePostalCodeSuggestion,
} from '../domain/postal-code-suggestion.policy.js'

export type PostalCodeSuggestionLookup = () => Promise<PostalCodeSuggestion | null>

/**
 * Todas as consultas partem juntas e vence a primeira resposta **completa** — a mais rápida costuma
 * ser a que não sabe nada, então `Promise.race` cru não serve. Sem nenhuma completa, responde a
 * primeira não nula **na ordem recebida**: a ordem é o desempate entre parciais. Falha antes de haver
 * vencedor sobe; depois dele, ninguém mais é ouvido.
 */
export function raceCompletePostalCodeSuggestion(
  lookups: readonly PostalCodeSuggestionLookup[],
): Promise<PostalCodeSuggestion | null> {
  if (lookups.length === 0) return Promise.resolve(null)

  return new Promise<PostalCodeSuggestion | null>((resolve, reject) => {
    const answers: (PostalCodeSuggestion | null)[] = lookups.map(() => null)
    let pendingLookups = lookups.length
    let isSettled = false

    const accept = (index: number, suggestion: PostalCodeSuggestion | null): void => {
      if (isSettled) return
      if (isCompletePostalCodeSuggestion(suggestion)) {
        isSettled = true
        resolve(suggestion)
        return
      }
      answers[index] = suggestion
      pendingLookups -= 1
      if (pendingLookups > 0) return
      isSettled = true
      resolve(answers.find((answer) => answer !== null) ?? null)
    }

    const fail = (error: unknown): void => {
      if (isSettled) return
      isSettled = true
      reject(error)
    }

    lookups.forEach((lookup, index) => {
      void lookup().then((suggestion) => accept(index, suggestion), fail)
    })
  })
}
