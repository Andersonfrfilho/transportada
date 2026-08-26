/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  checkTripMdfeRequirement,
  resolveTripRequiresMdfe,
} from '../domain/trip-mdfe-requirement.policy.js'
import { TripNotFoundError } from '../domain/trip.error.js'
import type { TripFiscalReadinessPort } from './read-trip-fiscal-readiness.use-case.js'

export class TripMdfeRequirementNotAllowedError extends ApiError {
  public constructor(reason: string) {
    super({
      code: reason,
      message: 'The trip does not accept this MDF-e requirement.',
      status: 422,
    })
  }
}

export type TripMdfeRequirement = {
  /** O que vale hoje, já com a derivação aplicada — a tela não recalcula a regra. */
  readonly effectiveRequiresMdfe: boolean
  readonly manifestableCount: number
  readonly reason: null | string
  readonly requiresMdfe: boolean | null
}

export type SetTripMdfeRequirementPort = {
  saveRequirement(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly reason: null | string
    readonly requiresMdfe: boolean | null
    readonly tripId: string
  }): Promise<void>
}

export type SetTripMdfeRequirementInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly readinessRepository: TripFiscalReadinessPort
  readonly reason: null | string
  readonly repository: SetTripMdfeRequirementPort
  readonly requiresMdfe: boolean | null
  readonly tripId: string
}

/**
 * Spec 065 D4c: a sobrescrita é **ação assinada**, não edição em linha. A classificação das notas
 * vem da mesma consulta que a prontidão usa, e não de um número que a tela mandou — quem decide se
 * a dispensa exige motivo é o estado real da carga.
 */
export async function setTripMdfeRequirement(
  input: SetTripMdfeRequirementInput,
): Promise<TripMdfeRequirement> {
  const documents = await input.readinessRepository.readDocumentReadiness({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  if (documents === null) throw new TripNotFoundError()

  const manifestableCount = documents.filter(
    (document) => document.expectedDocument === 'cte',
  ).length
  const block = checkTripMdfeRequirement({
    manifestableCount,
    reason: input.reason,
    requiresMdfe: input.requiresMdfe,
  })
  if (block !== null) throw new TripMdfeRequirementNotAllowedError(block)

  await input.repository.saveRequirement({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    reason: input.reason,
    requiresMdfe: input.requiresMdfe,
    tripId: input.tripId,
  })

  return {
    effectiveRequiresMdfe: resolveTripRequiresMdfe({
      manifestableCount,
      requiresMdfe: input.requiresMdfe,
    }),
    manifestableCount,
    reason: input.reason,
    requiresMdfe: input.requiresMdfe,
  }
}
