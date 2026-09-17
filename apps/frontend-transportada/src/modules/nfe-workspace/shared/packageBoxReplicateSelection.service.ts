/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PackageBoxSibling } from './packageBoxClient.service'

/**
 * Spec 155 (D4, G005): alvo de replicação é só irmã de família **sem** medida — a rota recusa
 * (409) sobrescrever quem já tem, e a tela nunca oferece o que a API já vai recusar.
 */
export function resolveReplicateTargets(
  family: readonly PackageBoxSibling[],
): readonly PackageBoxSibling[] {
  return family.filter((sibling) => sibling.measuredAt === null)
}

/**
 * Spec 155 (D5, D11, G010, G011): família confiável nasce com todos os alvos pré-marcados — o
 * conferente desmarca o que não servir. Família de formato assimétrico (D11) nasce com tudo
 * desmarcado, porque o rótulo sozinho não garante a mesma caixa física ali.
 */
export function initialReplicateSelection(input: {
  readonly isLowConfidenceFamily: boolean
  readonly targets: readonly PackageBoxSibling[]
}): ReadonlySet<string> {
  if (input.isLowConfidenceFamily) return new Set()
  return new Set(input.targets.map((target) => target.id))
}
