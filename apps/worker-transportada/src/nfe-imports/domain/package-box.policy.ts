/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type PackageBoxSource = {
  readonly code: string
  readonly commercialUnit: string
  readonly description: string
}

export type PackageBoxRow = {
  readonly commercialUnit: string
  readonly description: string
  readonly emitterTaxId: string
  readonly productCode: string
}

/**
 * As caixas que esta nota apresenta, para o cadastro se popular do que **roda** (spec 085, ADR-0062).
 *
 * ⚠️ A linha nasce **sem medida**. Medir vira preencher o que já está listado, em vez de cadastrar
 * 663 caixas do zero — e a fila ordena pelo que mais transporta, onde 12 caixas cobrem 25%.
 *
 * ⚠️ A chave é `(emitente, cProd, uCom)`: o `cProd` é o código **do emitente** e o `uCom` entra
 * porque o mesmo produto em `CX12` e `CX24` são **duas caixas diferentes** — medido em 345 NF-e,
 * `CX12` cobre 151 produtos distintos. Deduplicar aqui evita a nota com dez linhas do mesmo produto
 * mandar dez escritas iguais ao banco.
 *
 * ⚠️ Emitente sem CNPJ não gera linha: sem ele a chave não identifica caixa nenhuma, e uma linha
 * órfã ficaria para sempre na fila de medição sem ninguém saber de quem é.
 */
export function buildPackageBoxRows(input: {
  readonly emitterTaxId: string | undefined
  readonly products: readonly PackageBoxSource[]
}): readonly PackageBoxRow[] {
  const emitterTaxId = (input.emitterTaxId ?? '').trim()
  if (emitterTaxId === '') return []

  const byKey = new Map<string, PackageBoxRow>()
  for (const product of input.products) {
    /**
     * ⚠️ O código vai **como a nota o escreveu**, sem cortar. `nfe_products.code` é `text`, e a
     * ocupação casa a caixa com a linha da nota por igualdade: truncar aqui criava caixa que
     * aparecia na fila, era medida pelo conferente, e nunca alcançava viagem nenhuma — sem erro em
     * lugar nenhum. Vazio depois do `trim` é ausência de chave, e some.
     */
    const productCode = product.code
    const commercialUnit = product.commercialUnit
    if (productCode.trim() === '' || commercialUnit.trim() === '') continue

    byKey.set(`${productCode}|${commercialUnit}`, {
      commercialUnit,
      description: product.description.trim(),
      emitterTaxId,
      productCode,
    })
  }
  return [...byKey.values()]
}

/** O teto do CHECK da coluna: duas toneladas numa caixa de papelão já não é caixa de papelão. */
const MAX_GROSS_WEIGHT_GRAMS = 2_000_000

/**
 * O peso de **uma** caixa, quando a nota permite atribuí-lo (spec 085, ADR-0062).
 *
 * ⚠️ Só a nota de **um produto só** permite: com duas linhas o `pesoB` é da carga inteira, e
 * dividi-lo pelos volumes daria a média das caixas — número plausível, atribuído à caixa errada.
 * Medido em 663 caixas: 18 delas (9% das notas) ganham peso por este caminho, e é de graça.
 */
export function deriveBoxGrossWeightGrams(input: {
  readonly products: readonly PackageBoxSource[]
  readonly volumes: readonly { readonly grossWeight?: string; readonly quantity?: string }[]
}): number | null {
  if (input.products.length !== 1) return null

  let grossWeight = 0
  let quantity = 0
  for (const volume of input.volumes) {
    grossWeight += Number(volume.grossWeight ?? '0')
    quantity += Number(volume.quantity ?? '0')
  }
  if (!(grossWeight > 0) || !(quantity > 0)) return null

  const grams = Math.round((grossWeight / quantity) * 1000)
  if (grams <= 0 || grams > MAX_GROSS_WEIGHT_GRAMS) return null
  return grams
}
