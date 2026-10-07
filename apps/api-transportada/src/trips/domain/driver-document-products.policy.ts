/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF11, T4.6): o que o snapshot do motorista leva dos produtos de cada nota. Um item **por
 * código** — a ocorrência aponta produto por código (166) —, com a conta de `resolveDocumentProductPricing`
 * (menor ordinal, soma das quantidades, aviso de preço que varia). O aparelho só espelha; o servidor recalcula.
 */
import type { OccurrenceDeclaredAmountScope } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { resolveDeclaredAmountTarget } from './occurrence-declared-amount-target.policy.js'
import { resolveDocumentProductPricing } from './occurrence-product-pricing.policy.js'

export type DriverDocumentProductRow = {
  readonly code: string
  readonly commercialUnit: string
  readonly description: string
  readonly ordinal: number
  readonly quantity: string
  readonly unitValue: string
}

export type DriverDocumentProduct = {
  readonly code: string
  readonly description: string
  /** O valor unitário varia entre as linhas do código: o valor pago passa a ser exigido na linha. */
  readonly hasVaryingUnitValue: boolean
  /** A soma das linhas do código, com as casas da NF-e: é o teto do que se devolve. */
  readonly quantity: string
  /** A unidade comercial (`uCom`) da nota. */
  readonly unit: string
  readonly unitValue: string
}

export function buildDriverDocumentProducts(
  rows: readonly DriverDocumentProductRow[],
): readonly DriverDocumentProduct[] {
  const pricing = resolveDocumentProductPricing(
    rows.map((row) => ({ ...row, code: row.code.trim() })),
  )
  const descriptionByCode = new Map<string, string>()
  for (const row of [...rows].sort((left, right) => left.ordinal - right.ordinal)) {
    const code = row.code.trim()
    if (!descriptionByCode.has(code)) descriptionByCode.set(code, row.description)
  }

  return [...pricing].map(([code, line]) => ({
    code,
    description: descriptionByCode.get(code) ?? '',
    hasVaryingUnitValue: line.hasVaryingUnitValue,
    quantity: line.totalQuantity,
    unit: line.commercialUnit,
    unitValue: line.unitValue,
  }))
}

type TypeWithDeclaredAmountScope = {
  readonly declaredAmountScope: OccurrenceDeclaredAmountScope
  readonly itemsMode: DeliveryProofFieldMode
}

/**
 * O valor pago de escopo `item` numa nota sem produto não tem linha onde digitar: cai na ocorrência.
 * O tipo já vem com o modo de Produtos efetivo; aqui entra o que só a nota sabe, quantas linhas tem.
 */
export function refineDeclaredAmountScopeForDocument<
  TType extends TypeWithDeclaredAmountScope,
>(params: { readonly productCount: number; readonly type: TType }): TType {
  const scope = resolveDeclaredAmountTarget({
    itemsMode: params.type.itemsMode,
    lineCount: params.productCount,
    scope: params.type.declaredAmountScope,
  })
  return scope === params.type.declaredAmountScope
    ? params.type
    : { ...params.type, declaredAmountScope: scope }
}
