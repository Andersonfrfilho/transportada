/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 065 D4c: **três estados, não dois**. A regra da D3 acerta quase sempre — carga com nota de
 * CT-e manifesta, carga só urbana não —, mas a realidade tem canto que a regra não cobre, e regra
 * sem escape vira contorno em papel.
 *
 * `null` é o padrão de propósito. Campo obrigatório aqui faria o operador responder toda viagem a
 * uma pergunta que o sistema já sabe responder, e responder no automático — que é como se erra.
 */
export const TRIP_MDFE_REQUIREMENT_BLOCKS = {
  /**
   * Não existe manifesto vazio: a viagem ficaria esperando para sempre por um documento que nunca
   * vai ter o que declarar.
   */
  noManifestableDocuments: 'TRIP_MDFE_REQUIREMENT_NO_MANIFESTABLE_DOCUMENTS',
  /**
   * Carga intermunicipal circulando sem manifesto é multa e retenção em barreira. O produto não
   * impede — a operação tem razões que ele não conhece —, mas não deixa acontecer calado.
   */
  reasonRequired: 'TRIP_MDFE_REQUIREMENT_REASON_REQUIRED',
  /** Motivo sem dispensa não tem o que justificar, e ficaria na trilha explicando coisa nenhuma. */
  reasonNotApplicable: 'TRIP_MDFE_REQUIREMENT_REASON_NOT_APPLICABLE',
} as const

export type TripMdfeRequirementBlock =
  (typeof TRIP_MDFE_REQUIREMENT_BLOCKS)[keyof typeof TRIP_MDFE_REQUIREMENT_BLOCKS]

export type CheckTripMdfeRequirementParams = {
  /** Quantas notas da viagem esperam CT-e — é a classificação da D3, não um palpite da tela. */
  readonly manifestableCount: number
  readonly reason: null | string
  readonly requiresMdfe: boolean | null
}

export function checkTripMdfeRequirement(
  input: CheckTripMdfeRequirementParams,
): TripMdfeRequirementBlock | null {
  if (input.requiresMdfe !== false && input.reason !== null) {
    return TRIP_MDFE_REQUIREMENT_BLOCKS.reasonNotApplicable
  }
  if (input.requiresMdfe === true && input.manifestableCount === 0) {
    return TRIP_MDFE_REQUIREMENT_BLOCKS.noManifestableDocuments
  }
  if (input.requiresMdfe === false && input.manifestableCount > 0 && input.reason === null) {
    return TRIP_MDFE_REQUIREMENT_BLOCKS.reasonRequired
  }

  return null
}

/**
 * A derivação da D3 num lugar só: **sem nota de CT-e não há o que manifestar**. Quem sobrescreve
 * decide; quem não sobrescreve recebe a resposta que o sistema já tinha.
 */
export function resolveTripRequiresMdfe(input: {
  readonly manifestableCount: number
  readonly requiresMdfe: boolean | null
}): boolean {
  return input.requiresMdfe ?? input.manifestableCount > 0
}
