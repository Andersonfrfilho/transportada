/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'NFE_CARGO_VOLUME'
const VOLUME_SCALE = 6n
const VOLUME_FACTOR = 10n ** VOLUME_SCALE

/**
 * ⚠️ **Uma origem só, e não é descuido.** O peso tem `xml` porque o emitente declara `pesoB` no
 * bloco `<vol>`. **A NF-e não tem campo de cubagem** — nem dimensão, nem metro cúbico —, então
 * `declarado` não é um estado alcançável, e pôr no tipo seria código morto que parece cobertura
 * (spec 075 D3). Quando existir declaração manual por nota, ela entra junto com o campo que a
 * produz.
 */
export const CARGO_VOLUME_SOURCE = {
  /** `quantidade de volumes × fator da espécie` — a nota não traz medida nenhuma. */
  estimated: 'estimated',
} as const

export type CargoVolumeSource = (typeof CARGO_VOLUME_SOURCE)[keyof typeof CARGO_VOLUME_SOURCE]

export type ResolveCargoVolumeParams = {
  readonly volumeFactor: string | null
  readonly volumeQuantity: string | null
}

export type ResolvedCargoVolume = {
  readonly source: CargoVolumeSource
  readonly volumeM3: string
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

/**
 * A cubagem que a ocupação da viagem usa, na ordem que a spec 075 decidiu: só há estimativa, e a
 * ausência dela é ausência — nunca zero. Zero declararia que a carga não ocupa espaço, e somaria
 * como se fosse medida (ADR-0052, mesma decisão para massa).
 *
 * A estimativa é **por volume** e não um valor fixo por nota, porque a quantidade de volumes é o
 * único sinal de tamanho que a nota traz. Sem volume não há de onde estimar.
 */
export function resolveCargoVolume({
  volumeFactor,
  volumeQuantity,
}: ResolveCargoVolumeParams): ResolvedCargoVolume | null {
  const factor = toScaled(volumeFactor)
  const quantity = toScaled(volumeQuantity)
  if (factor <= 0n || quantity <= 0n) return null

  return {
    source: CARGO_VOLUME_SOURCE.estimated,
    volumeM3: formatScaledDecimal(divideHalfUp(factor * quantity, VOLUME_FACTOR), VOLUME_SCALE),
  }
}

export type MeasuredCargoItem = {
  /** O m³ da caixa de papelão medida pelo conferente; `null` é caixa ainda sem medida. */
  readonly boxVolumeM3: string | null
  /** `qCom` da linha — na unidade comercial dela, que nem sempre é a caixa. */
  readonly quantity: string
  /**
   * Quantas unidades comerciais cabem numa caixa. `1` quando `uCom` já é a caixa (`CX24`), e o que
   * o conferente informou quando não é (`UN`, `KG`).
   */
  readonly unitsPerBox: number
}

export type ResolvedMeasuredCargoVolume = {
  readonly source: 'measured' | 'partial'
  readonly volumeM3: string
}

/**
 * A cubagem somada **por item** a partir da caixa medida (spec 085 G006). É o degrau acima da
 * estimativa por espécie da spec 075: ali o único sinal de tamanho era a contagem de volumes; aqui
 * cada linha da nota multiplica a própria caixa.
 *
 * ⚠️ Item sem medida usa a **mediana** das caixas já medidas da empresa, e a origem cai para
 * `partial` — a marca viaja junto com o número, como no peso (ADR-0052) e na capacidade do veículo.
 * Mediana e não média: uma caixa de geladeira no meio de mil caixas de refrigerante move a média e
 * não move a mediana.
 *
 * ⚠️ **`uCom` nem sempre é a caixa.** A linha em `CX24` já vem contada em caixas; a linha em `UN`
 * vem em unidades, e multiplicá-la pela caixa master dava dez vezes o volume real — número que, por
 * vir marcado `measured`, vencia a estimativa e saía da tela sem aviso nenhum.
 *
 * ⚠️ **Sem reserva, item sem medida devolve ausência** em vez de sair da soma. Um total que ignora
 * linhas subestima a carga, e ocupação menor que a real é o número que faz alguém continuar
 * carregando um baú que já encheu.
 */
export function resolveMeasuredCargoVolume(input: {
  readonly fallbackBoxVolumeM3: string | null
  readonly items: readonly MeasuredCargoItem[]
}): ResolvedMeasuredCargoVolume | null {
  if (input.items.length === 0) return null
  if (!input.items.some((item) => item.boxVolumeM3 !== null)) return null

  const fallback = input.fallbackBoxVolumeM3
  let total = 0n
  let usedFallback = false
  for (const item of input.items) {
    const box = item.boxVolumeM3 ?? fallback
    if (box === null) return null
    if (item.boxVolumeM3 === null) usedFallback = true
    total += divideHalfUp(toScaled(box) * toScaled(String(countMeasuredBoxes(item))), VOLUME_FACTOR)
  }
  if (total <= 0n) return null

  return {
    source: usedFallback ? 'partial' : 'measured',
    volumeM3: formatScaledDecimal(total, VOLUME_SCALE),
  }
}

/**
 * A reserva de quem ainda não foi medido. Mediana das medidas da empresa — a de par é a média dos
 * dois centrais, como manda a definição, e sem medida nenhuma não há reserva.
 */
export function medianBoxVolumeM3(values: readonly string[]): string | null {
  if (values.length === 0) return null
  const ordered = values.map(toScaled).sort((first, second) => (first < second ? -1 : 1))
  const middle = ordered.length >> 1
  const lower = ordered[ordered.length % 2 === 0 ? middle - 1 : middle]
  const upper = ordered[middle]
  if (lower === undefined || upper === undefined) return null
  return formatScaledDecimal(divideHalfUp(lower + upper, 2n), VOLUME_SCALE)
}

/**
 * Quantas caixas a linha ocupa. ⚠️ Arredonda **para cima**: cinco unidades de um produto que vem de
 * doze ainda viajam dentro de uma caixa, e o baú não sabe que ela está pela metade.
 */
export function countMeasuredBoxes(item: MeasuredCargoItem): number {
  const quantity = Number(item.quantity)
  const perBox = item.unitsPerBox > 0 ? item.unitsPerBox : 1
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  return perBox === 1 ? quantity : Math.ceil(quantity / perBox)
}
