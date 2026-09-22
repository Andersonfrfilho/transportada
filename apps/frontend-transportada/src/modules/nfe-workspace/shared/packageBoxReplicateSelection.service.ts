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

/**
 * T14 (revisão final, MÉDIO-1): `selected` pode conter um id que não está mais entre `targets`
 * depois de um refetch — a irmã foi medida por outra pessoa nesse meio-tempo, e a leitura anterior
 * ficou obsoleta. Contar e enviar o `selected` cru grava esse id junto, e a rota recusa (409) o
 * lote inteiro por causa de um alvo que a tela nem devia mais oferecer (D4). Cruzar contra os
 * `targets` atuais é o que descarta o obsoleto antes de contar ou confirmar.
 */
export function resolveSelectedTargetIds(input: {
  readonly selected: ReadonlySet<string>
  readonly targets: readonly PackageBoxSibling[]
}): readonly string[] {
  return input.targets.filter((target) => input.selected.has(target.id)).map((target) => target.id)
}
