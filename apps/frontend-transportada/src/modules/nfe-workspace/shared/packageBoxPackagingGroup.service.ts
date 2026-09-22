/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PackageBox } from './packageBoxClient.service'

export type PackageBoxPackagingGroup = Readonly<{
  items: readonly PackageBox[]
  key: string
}>

/**
 * Spec 155 (D3, D8, G008): agrupa a página da fila pelo grupo de embalagem `(emitente, cProd)` —
 * mesmo produto, embalagens diferentes —, preservando a ordem de primeira aparição. Puramente
 * visual: a réplica de medida (D1) nunca olha para este grupo, só para a família de variação
 * (`familyKey`).
 *
 * ⚠️ O mesmo `productCode` de emitentes diferentes é produto **diferente** — a chave leva o
 * emitente, como a família (T2.3, correção da D1).
 */
export function groupPackageBoxesByPackaging(
  items: readonly PackageBox[],
): readonly PackageBoxPackagingGroup[] {
  const order: string[] = []
  const groups = new Map<string, PackageBox[]>()

  for (const item of items) {
    const key = `${item.emitterTaxId}|${item.productCode}`
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, [item])
      order.push(key)
    } else {
      existing.push(item)
    }
  }

  return order.map((key) => ({ items: groups.get(key) ?? [], key }))
}
