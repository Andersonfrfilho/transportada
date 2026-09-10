/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoBedDimensions } from './cargo-layout.policy.js'

const MILLIMETRES_PER_METRE = 1000

/**
 * Uma caixa medida pelo conferente, com quantas delas a parada carrega. Dimensão nula é caixa que
 * ele ainda não alcançou — e uma só basta para a conta inteira não acontecer.
 */
export type CargoPlanBox = {
  readonly count: number
  /**
   * Spec 119: a nota de onde a caixa veio (`nfe_documents.id`) e o número impresso dela. Carona da
   * caixa até o desenho, nunca critério de posição — ausente é "não se sabe", e sai `null`.
   */
  readonly documentId?: string | null
  readonly documentNumber?: string | null
  readonly heightMm: number | null
  /**
   * Spec 094: as restrições que decidem **onde** a caixa pode ir. `null` é "ninguém informou", nunca
   * "pode" — e a diferença aparece no desenho, que empilha e marca o arranjo como presumido.
   *
   * Opcionais porque a contagem de camadas da 088 não as consulta: ela conta área sobre área, e
   * exigir os campos ali obrigaria toda chamada antiga a fingir que sabe.
   */
  readonly isFragile?: boolean | null
  readonly isStackable?: boolean | null
  readonly keepUpright?: boolean | null
  readonly label?: string
  readonly lengthMm: number | null
  readonly maxStackCount?: number | null
  readonly widthMm: number | null
}

export type CargoPlanLayers = {
  /** Quantas caixas a parada carrega ao todo — o teto do que o par abaixo pode descrever. */
  readonly boxCount: number
  readonly boxesPerLayer: number
  readonly layers: number
}

/**
 * Spec 088 D5: **onde a caixa está medida, o desenho conta camadas.**
 *
 * Área da faixa ÷ pegada da caixa dá as caixas por camada; altura do baú ÷ altura da caixa dá as
 * camadas. É a spec 085 pagando: a fila de medição existia sem consumidor até aqui.
 *
 * ⚠️ **Só quando TODA caixa daquela parada está medida.** Uma medida faltando torna a conta um
 * palpite com cara de contagem — e "18 caixas por camada" é lido como instrução, não como
 * estimativa. Falta uma? a faixa mostra só a profundidade, e a tela diz quantas faltam medir.
 *
 * ⚠️ **Não é empacotamento** (bin packing está fora do escopo, D3). É área sobre área, sem
 * orientação e sem sobra entre caixas — por isso o par sai pela caixa **maior** e pela **mais
 * alta** da parada: subestimar faz alguém parar de carregar cedo, e superestimar faz a carga da
 * parada invadir a faixa da parada seguinte.
 */
/**
 * Quantas caixas desta parada o conferente ainda não mediu.
 *
 * ⚠️ Existe porque `layers: null` tem **duas** causas — falta de medida, e caixa que não cabe na
 * faixa — e a tela precisa distinguir. Sem isto ela mandava medir uma parada 100% medida cuja caixa
 * era maior que a própria faixa, e o conferente ia à fila da 085 e não achava nada.
 */
export function countBoxesToMeasure(boxes: readonly CargoPlanBox[]): number {
  return boxes
    .filter((box) => box.heightMm === null || box.lengthMm === null || box.widthMm === null)
    .reduce((total, box) => total + Math.max(0, box.count), 0)
}

export function resolveCargoPlanLayers(input: {
  readonly bandDepthM: string | null
  readonly bed: CargoBedDimensions | null
  readonly boxes: readonly CargoPlanBox[]
}): CargoPlanLayers | null {
  const { bandDepthM, bed, boxes } = input
  if (bed === null || bandDepthM === null || boxes.length === 0) return null
  if (boxes.some((box) => box.heightMm === null || box.lengthMm === null || box.widthMm === null)) {
    return null
  }

  const boxCount = boxes.reduce((total, box) => total + Math.max(0, box.count), 0)
  if (boxCount <= 0) return null

  const bandDepth = toMillimetres(bandDepthM)
  const bedWidth = toMillimetres(bed.widthM)
  const bedHeight = toMillimetres(bed.heightM)
  /** O guard acima já provou os três não-nulos; o `?? 0` aqui só escondia qual guard é o real. */
  const measured = boxes.filter(isMeasuredBox)
  const footprint = Math.max(...measured.map((box) => box.lengthMm * box.widthMm))
  const tallest = Math.max(...measured.map((box) => box.heightMm))
  if (bandDepth <= 0 || bedWidth <= 0 || bedHeight <= 0 || footprint <= 0 || tallest <= 0) {
    return null
  }

  const boxesPerLayer = Math.min(boxCount, Math.floor((bandDepth * bedWidth) / footprint))
  if (boxesPerLayer <= 0) return null

  /** O par nunca descreve mais caixa do que a parada tem: a última camada costuma vir pela metade. */
  const layers = Math.min(Math.floor(bedHeight / tallest), Math.ceil(boxCount / boxesPerLayer))
  if (layers <= 0) return null

  return { boxCount, boxesPerLayer, layers }
}

type MeasuredCargoPlanBox = CargoPlanBox &
  Readonly<{ heightMm: number; lengthMm: number; widthMm: number }>

function isMeasuredBox(box: CargoPlanBox): box is MeasuredCargoPlanBox {
  return box.heightMm !== null && box.lengthMm !== null && box.widthMm !== null
}

/** Metro com milímetro (`8.900`) para o milímetro inteiro que a caixa medida usa. */
function toMillimetres(value: string): number {
  return Math.round(Number(value) * MILLIMETRES_PER_METRE)
}

/**
 * Spec 119: as caixas de uma nota, carimbadas com ela. Chamado onde as caixas viram **da parada** —
 * a prévia e o detalhe da viagem —, para os dois caminhos carimbarem pela mesma regra.
 */
export function stampCargoNote(input: {
  readonly boxes: readonly CargoPlanBox[]
  readonly documentId: string
  readonly documentNumber: string | null
}): CargoPlanBox[] {
  return input.boxes.map((box) => ({
    ...box,
    documentId: input.documentId,
    documentNumber: input.documentNumber,
  }))
}
