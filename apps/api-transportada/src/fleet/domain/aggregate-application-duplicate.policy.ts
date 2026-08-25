/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type AggregateApplicationSubmission = Readonly<{
  declaredData: Record<string, unknown>
  email: string
  name: string
  phone: string
}>

export type DuplicateCheckInput = Readonly<{
  duplicateDriverId: string | null
  existingPendingApplicationId: string | null
  submission: AggregateApplicationSubmission
}>

export type DuplicateCheckOutcome =
  | Readonly<{ duplicateDriverId: string | null; kind: 'insert' }>
  | Readonly<{
      applicationId: string
      duplicateDriverId: string | null
      kind: 'resubmit'
      submission: AggregateApplicationSubmission
    }>

/**
 * Duplicado nunca recusa sozinho e nunca muda a resposta pública — quem decide é o operador. Uma
 * candidatura pendente já aberta vira reenvio (a mesma linha ganha `resubmittedAt`/
 * `latestSubmission`, sem duplicar); documento já motorista na raiz do grupo apenas marca
 * `duplicateDriverId`, insira ela ou atualize o reenvio.
 */
export function resolveDuplicateCheckOutcome(input: DuplicateCheckInput): DuplicateCheckOutcome {
  if (input.existingPendingApplicationId !== null) {
    return {
      applicationId: input.existingPendingApplicationId,
      duplicateDriverId: input.duplicateDriverId,
      kind: 'resubmit',
      submission: input.submission,
    }
  }

  return { duplicateDriverId: input.duplicateDriverId, kind: 'insert' }
}
