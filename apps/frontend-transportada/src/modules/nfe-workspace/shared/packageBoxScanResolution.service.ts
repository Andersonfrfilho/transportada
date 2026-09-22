/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Decisão extraída para função pura (mesmo motivo de `packageBoxScan.ts`): esta app não tem
 * renderer de componente para os contratos — o que importa aqui é testável sem DOM. Uma caixa lida
 * (câmera ou pistola) que já tem medida não pode abrir a edição em silêncio nem cair no mesmo
 * "não encontrada" de quem não casou com nada: ela precisa de um terceiro desfecho, `alreadyMeasured`,
 * que o painel usa para mostrar as medidas atuais antes de deixar o operador decidir se confere.
 */
export type PackageBoxScanResolution<TBox> =
  | Readonly<{ kind: 'alreadyMeasured'; box: TBox }>
  | Readonly<{ kind: 'candidates'; candidates: readonly TBox[] }>
  | Readonly<{ kind: 'notFound' }>
  | Readonly<{ kind: 'open'; box: TBox }>

type MeasurableBox = Readonly<{ measuredAt: null | string }>

/**
 * Nenhuma caixa casada é `notFound`; mais de uma é `candidates` (o GTIN ainda não está gravado nas
 * caixas — a etiqueta pode casar caixas de emitentes diferentes, spec 085); exatamente uma casada
 * decide entre `open` (pendente, segue igual a antes) e `alreadyMeasured` (já tem medida gravada).
 */
export function resolvePackageBoxScanMatch<TBox extends MeasurableBox>(
  items: readonly TBox[],
): PackageBoxScanResolution<TBox> {
  if (items.length > 1) return { kind: 'candidates', candidates: items }
  const [box] = items
  if (box === undefined) return { kind: 'notFound' }
  return resolvePackageBoxScanSelection(box)
}

/** Mesma decisão `open`/`alreadyMeasured`, para quando o operador escolhe uma candidata na lista. */
export function resolvePackageBoxScanSelection<TBox extends MeasurableBox>(
  box: TBox,
): Readonly<{ kind: 'alreadyMeasured'; box: TBox } | { kind: 'open'; box: TBox }> {
  return box.measuredAt === null ? { kind: 'open', box } : { kind: 'alreadyMeasured', box }
}

/**
 * ⚠️ A busca de uma etiqueta lida nunca esconde caixa já medida: sempre `status: 'all'`, mesmo com
 * a listagem normal em `pending`/`measured`. O filtro que o operador escolheu para a lista fica
 * intocado — ele só vale quando não há etiqueta em jogo.
 */
export function resolvePackageBoxQueryStatus<TStatus extends string>(
  input: Readonly<{ scanned: null | string; status: TStatus }>,
): 'all' | TStatus {
  return input.scanned === null ? input.status : 'all'
}
