/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

type PrintableBox = Readonly<{
  isEstimated: boolean
  isSplit: boolean
  stopSequence: number
  depthM: number
  xM: number
}>

export type CargoPrintRow = Readonly<{
  boxes: number
  fromM: number
  presumed: number
  split: number
  stopSequence: number
  toM: number
}>

/**
 * O resumo que vai para o papel.
 *
 * ⚠️ **O agregado carrega a van sozinho, longe da tela**: um mapa que só existe no navegador não
 * chega em quem empilha. E a folha sai em laser mono no galpão, então nada aqui pode depender de
 * cor — a ordem de carregamento, a faixa em metros e as contagens são o que carrega a informação.
 *
 * ⚠️ A ordem da folha é a **ordem de carregamento**, que é o inverso da ordem de entrega: quem
 * empilha começa pela última parada, encostando na testeira. Imprimir na ordem de entrega faria a
 * folha ser lida de baixo para cima.
 */
export function buildCargoPrintSummary(boxes: readonly PrintableBox[]): readonly CargoPrintRow[] {
  const rows = new Map<
    number,
    { boxes: number; fromM: number; presumed: number; split: number; toM: number }
  >()

  for (const box of boxes) {
    const current = rows.get(box.stopSequence) ?? {
      boxes: 0,
      fromM: Number.POSITIVE_INFINITY,
      presumed: 0,
      split: 0,
      toM: 0,
    }
    rows.set(box.stopSequence, {
      boxes: current.boxes + 1,
      fromM: Math.min(current.fromM, box.xM),
      presumed: current.presumed + (box.isEstimated ? 1 : 0),
      split: current.split + (box.isSplit ? 1 : 0),
      toM: Math.max(current.toM, box.xM + box.depthM),
    })
  }

  return [...rows.entries()]
    .map(([stopSequence, row]) => ({ ...row, stopSequence }))
    .sort((first, second) => second.stopSequence - first.stopSequence)
}
