/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeTaxId } from '@/modules/shared/taxId.service'

const PUBLIC_AGGREGATE_APPLICATIONS_PATH = '/public/aggregate-applications'

export type SubmitAggregateApplicationInput = Readonly<{
  companyId: string
  declaredData: Readonly<Record<string, unknown>>
  email: string
  name: string
  phone: string
  taxId: string
  turnstileToken?: string
}>

export type AggregateApplicationClient = Readonly<{
  /**
   * `202` invariável na API: documento novo, reenvio e documento já motorista respondem igual, e o
   * cliente nunca distingue os três — o agradecimento é o mesmo texto para todos.
   */
  submit: (input: SubmitAggregateApplicationInput) => Promise<boolean>
}>

export function createAggregateApplicationClient(
  dependencies: Readonly<{ apiBaseUrl: string }>,
): AggregateApplicationClient {
  return {
    async submit(input) {
      try {
        const response = await fetch(`${dependencies.apiBaseUrl}${PUBLIC_AGGREGATE_APPLICATIONS_PATH}`, {
          body: JSON.stringify({ ...input, taxId: normalizeTaxId(input.taxId) }),
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        return response.status === 202
      } catch {
        return false
      }
    },
  }
}
