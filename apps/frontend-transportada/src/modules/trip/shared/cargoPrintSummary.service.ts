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
    {
      boxes: number
      fromM: number
      presumed: number
      split: number
      splitFromM: number
      splitToM: number
      toM: number
    }
  >()

  for (const box of boxes) {
    const current = rows.get(box.stopSequence) ?? {
      boxes: 0,
      fromM: Number.POSITIVE_INFINITY,
      presumed: 0,
      split: 0,
      splitFromM: Number.POSITIVE_INFINITY,
      splitToM: 0,
      toM: 0,
    }
    const start = lanes ? box.yM : box.xM
    const end = lanes ? box.yM + box.widthM : box.xM + box.depthM
    rows.set(box.stopSequence, {
      boxes: current.boxes + 1,
      fromM: box.isSplit ? current.fromM : Math.min(current.fromM, start),
      presumed: current.presumed + (box.isEstimated ? 1 : 0),
      split: current.split + (box.isSplit ? 1 : 0),
      /**
       * ⚠️ **A dividida também tem lugar, e é o único que resta quando não sobra inteira.** A faixa
       * ignorava a caixa dividida de propósito — ela viaja no topo do lado de dentro e não define a
       * faixa da parada —, e com **todas** divididas o acumulador ficava no infinito com que nasceu:
       * a folha imprimia `Infinity m a 0.00 m`. Medido na tela em 2026-09-10, parada 9 de 9, com 23
       * caixas e as 23 divididas.
       */
      splitFromM: box.isSplit ? Math.min(current.splitFromM, start) : current.splitFromM,
      splitToM: box.isSplit ? Math.max(current.splitToM, end) : current.splitToM,
      toM: box.isSplit ? current.toM : Math.max(current.toM, end),
    })
  }

  return (
    [...rows.entries()]
      .map(([stopSequence, row]) => ({
        ...row,
        ...(Number.isFinite(row.fromM) ? {} : { fromM: row.splitFromM, toM: row.splitToM }),
        stopSequence,
      }))
      /** Sem caixa nenhuma com lugar — nem inteira, nem dividida — a faixa é ausência, não zero. */
      .filter((row) => Number.isFinite(row.fromM))
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
