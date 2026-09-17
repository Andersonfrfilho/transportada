/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PackageBoxSibling } from './packageBoxClient.service'
import type { ReplicateOffer } from './packageBoxReplicateOffer.service'

export type FamilySourceCandidate = Readonly<{
  grossWeightGrams: null | number
  heightMm: null | number
  id: string
  lengthMm: null | number
  measuredAt: null | string
  measurementSource: null | PackageBoxSibling['measurementSource']
  unitsPerBox: number
  widthMm: null | number
}>

type MeasuredCandidate = Readonly<{
  heightMm: number
  id: string
  lengthMm: number
  measurementSource: null | PackageBoxSibling['measurementSource']
  unitsPerBox: number
  widthMm: number
}>

function isMeasured(candidate: FamilySourceCandidate): candidate is FamilySourceCandidate & {
  heightMm: number
  lengthMm: number
  widthMm: number
} {
  return (
    candidate.measuredAt !== null &&
    candidate.heightMm !== null &&
    candidate.lengthMm !== null &&
    candidate.widthMm !== null
  )
}

/**
 * Spec 155 (D12, G012): "aplicar a todos os sabores" escolhe a origem entre a própria caixa (se
 * medida) e as irmãs medidas da família, sempre que sobrar pendente para receber a cópia.
 *
 * ⚠️ Prefere `measurementSource` diferente de `replicated` — uma medida **conferida**. Só quando a
 * família não tem nenhuma conferida (todas as medidas vieram de uma réplica anterior) é que uma
 * `replicated` vira origem: decisão do usuário em 2026-09-17 (MÉDIO-3 da revisão final) — réplica
 * conta como medida e pode ser origem de nova réplica.
 */
export function resolveFamilyReplicationSource(input: {
  readonly currentBox: FamilySourceCandidate
  readonly siblings: readonly PackageBoxSibling[]
}): ReplicateOffer | undefined {
  const candidates: readonly FamilySourceCandidate[] = [input.currentBox, ...input.siblings]
  const hasPending = candidates.some((candidate) => candidate.measuredAt === null)
  if (!hasPending) return undefined

  const measured = candidates.filter(isMeasured)
  const [firstMeasured] = measured
  if (firstMeasured === undefined) return undefined

  const origin: MeasuredCandidate =
    measured.find((candidate) => candidate.measurementSource !== 'replicated') ?? firstMeasured

  return {
    boxId: origin.id,
    dimensions: {
      heightMm: origin.heightMm,
      lengthMm: origin.lengthMm,
      unitsPerBox: origin.unitsPerBox,
      widthMm: origin.widthMm,
    },
  }
}
