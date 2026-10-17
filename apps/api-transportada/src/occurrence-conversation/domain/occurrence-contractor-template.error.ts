/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D5): a recusa do modelo do e-mail à contratante escolhido no tipo. Leva **todos** os
 * problemas de uma vez; modelo de outra empresa é `not_found`, o mesmo de inexistente.
 */
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'
import type { ContractorTemplateProblem } from './occurrence-contractor-template.policy.js'

const TEMPLATE_FIELD = 'contractorNotificationTemplateKey'
const VARIABLES_FIELD = 'variables'

/** Um detalhe por problema (`message` é o código); cada variável desconhecida ganha o seu, em `variables`. */
export function toTemplateProblemDetails(
  problems: readonly ContractorTemplateProblem[],
): readonly ApiErrorDetail[] {
  return problems.flatMap((problem) => [
    { field: TEMPLATE_FIELD, message: problem.code },
    ...(problem.code === 'unknown_variables'
      ? problem.variables.map((variable) => ({ field: VARIABLES_FIELD, message: variable }))
      : []),
  ])
}

export class OccurrenceContractorTemplateInvalidError extends ApiError {
  public constructor(problems: readonly ContractorTemplateProblem[]) {
    super({
      code: 'OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID',
      details: toTemplateProblemDetails(problems),
      message: 'The notification template cannot be used for the email to the contractor.',
      status: 400,
    })
  }
}
