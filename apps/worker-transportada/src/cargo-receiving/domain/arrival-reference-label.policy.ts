/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S3): o perfil guarda o texto que antecede o número da
 * carga no `infCpl` (ex.: `NroCarga:`), e não uma expressão — a expressão do usuário passava pelo
 * filtro e retrocedia. O texto é literal; quem monta a busca é o motor (`load-reference.policy.ts`).
 */
import { RECEIVING_PROFILE_LIMITS } from './contractor-receiving-profile.constant.js'

export const ARRIVAL_REFERENCE_LABEL_ISSUES = ['blank', 'too_long', 'control_character'] as const
export type ArrivalReferenceLabelIssue = (typeof ARRIVAL_REFERENCE_LABEL_ISSUES)[number]

export const ARRIVAL_REFERENCE_LABEL_ISSUE_MESSAGES: Readonly<
  Record<ArrivalReferenceLabelIssue, string>
> = {
  blank: 'The text before the load number must not be blank',
  control_character: 'The text before the load number must not have control characters',
  too_long: `The text before the load number must have at most ${RECEIVING_PROFILE_LIMITS.arrivalReferenceLabelMaxLength} characters`,
}

const CONTROL_CHARACTER = /\p{Cc}/u

export function findArrivalReferenceLabelIssue(
  label: string,
): ArrivalReferenceLabelIssue | undefined {
  if (label.trim().length === 0) return 'blank'
  if (label.length > RECEIVING_PROFILE_LIMITS.arrivalReferenceLabelMaxLength) return 'too_long'
  return CONTROL_CHARACTER.test(label) ? 'control_character' : undefined
}
