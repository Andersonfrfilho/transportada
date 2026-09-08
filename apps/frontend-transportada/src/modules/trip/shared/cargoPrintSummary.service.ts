/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Em que eixo as paradas se dividem — cópia por valor do vocabulário da API (spec 100). */
export type StopArrangement = 'depth' | 'lanes'

type PrintableBox = Readonly<{
  isEstimated: boolean
  isSplit: boolean
  stopSequence: number
  depthM: number
  /** A largura e o `y` só são lidos em faixas, e são eles que medem a faixa ali. */
  widthM: number
  xM: number
  yM: number
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
 * ⚠️ **A faixa em metros não conta a carga dividida.** Ela mora fora da própria fatia, mais funda, e
 * incluí-la fazia a folha imprimir uma faixa que começa dentro da parada seguinte — apontando o
 * lugar errado na única informação que a folha promete carregar. A sobra aparece na coluna dela.
 *
 * ⚠️ A ordem da folha é a **ordem de carregamento**, que é o inverso da ordem de entrega: quem
 * empilha começa pela última parada, encostando na testeira. Imprimir na ordem de entrega faria a
 * folha ser lida de baixo para cima.
 */
export function buildCargoPrintSummary(
  boxes: readonly PrintableBox[],
  /**
   * Spec 100: em faixas a folha mede a **largura**, não a profundidade — nenhuma parada está atrás
   * de outra, e o intervalo de profundidade seria o mesmo para todas.
   *
   * ⚠️ Ausente assume `depth`, o comportamento de sempre: uma API que ainda não publica o arranjo
   * não pode fazer a folha inverter a ordem de carregamento sozinha.
   */
  arrangement: StopArrangement = 'depth',
): readonly CargoPrintRow[] {
  const lanes = arrangement === 'lanes'
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
      fromM: box.isSplit ? current.fromM : Math.min(current.fromM, lanes ? box.yM : box.xM),
      presumed: current.presumed + (box.isEstimated ? 1 : 0),
      split: current.split + (box.isSplit ? 1 : 0),
      toM: box.isSplit
        ? current.toM
        : Math.max(current.toM, lanes ? box.yM + box.widthM : box.xM + box.depthM),
    })
  }

  return (
    [...rows.entries()]
      .map(([stopSequence, row]) => ({ ...row, stopSequence }))
      /**
       * ⚠️ **A ordem inverte com o eixo.** Em profundidade a folha é a de carregamento — a última
       * entrega primeiro, porque ela vai ao fundo. Em faixas quem carrega começa pela faixa mais à
       * mão, que é a da primeira entrega.
       */
      .sort((first, second) =>
        lanes ? first.stopSequence - second.stopSequence : second.stopSequence - first.stopSequence,
      )
  )
}
