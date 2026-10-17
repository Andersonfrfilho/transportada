/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106, D2): qual modelo do cadastro escreve o e-mail da ocorrência. A precedência é a
 * "mais específica vence" da 218 — exceção da contratante da nota, depois o tipo — e **nulo é sem modelo**:
 * não cai no `is_default` do tipo de e-mail `occurrence` nem em texto antigo.
 */
import { resolveWithOverrides } from '../../shared/resolve-with-overrides.policy.js'

export type ResolveEffectiveOccurrenceMailTemplateIdParams = {
  /** O modelo da exceção da contratante da nota; nulo ou ausente herda do tipo. */
  readonly contractorOverride: null | string | undefined
  /** O modelo do tipo de ocorrência. */
  readonly general: null | string | undefined
}

export function resolveEffectiveOccurrenceMailTemplateId(
  params: ResolveEffectiveOccurrenceMailTemplateIdParams,
): null | string {
  return resolveWithOverrides<null | string>({
    contractorOverride: params.contractorOverride ?? null,
    fallback: null,
    general: params.general ?? null,
    recipientOverride: null,
  })
}
