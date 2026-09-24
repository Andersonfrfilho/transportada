/* Copyright (c) 2026 Ada Technology. MIT License. */

/** A importação da NF-e nunca preenche `unitsPerBox` — toda caixa nasce gravada com este valor. */
export const DEFAULT_UNITS_PER_BOX = 1

export type ResolveInitialUnitsPerBoxInput = Readonly<{
  measuredAt: null | string
  packagingUnitCount: number | undefined
  unitsPerBox: number
}>

/**
 * ⚠️ A API já devolve `packagingUnitCount` (o sufixo numérico da unidade comercial, `CX9` → 9), mas
 * `unitsPerBox` é a coluna do banco — que nasce `1` porque a importação da NF-e nunca a preenche.
 * Sem esta função o formulário sempre abria pedindo um dado que já temos. Só substitui quando a
 * caixa ainda não foi medida **e** o valor gravado ainda é o padrão: uma caixa já medida, ou com
 * `unitsPerBox` diferente de `1` (alguém já corrigiu), mantém o que está gravado — o conferente
 * segue podendo editar o campo dos dois jeitos.
 */
export function resolveInitialUnitsPerBox(input: ResolveInitialUnitsPerBoxInput): number {
  if (input.measuredAt !== null) return input.unitsPerBox
  if (input.unitsPerBox !== DEFAULT_UNITS_PER_BOX) return input.unitsPerBox
  if (input.packagingUnitCount === undefined) return input.unitsPerBox
  return input.packagingUnitCount
}
