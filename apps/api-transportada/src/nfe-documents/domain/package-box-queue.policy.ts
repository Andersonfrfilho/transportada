/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Cobre 80% do que roda: o resto da cauda custa o mesmo tempo do conferente por fatia irrelevante. */
const DEFAULT_COVERAGE_TARGET = 0.8

export type MeasurementQueueItem = {
  readonly id: string
  /** `true` quando o conferente já mediu esta caixa — decide a ordem, nunca a fatia. */
  readonly measured: boolean
  /** Quantos volumes desta caixa a empresa já transportou — é o que ordena a fila. */
  readonly transportedVolumes: number
}

export type MeasurementQueueEntry = MeasurementQueueItem & {
  readonly cumulativeShare: number
  readonly share: number
  readonly withinCoverage: boolean
}

export type MeasurementQueue = {
  readonly coveredCount: number
  readonly entries: readonly MeasurementQueueEntry[]
  readonly totalVolumes: number
}

/**
 * A fila de quem mede a caixa, na ordem do que **roda** (spec 085 G005).
 *
 * ⚠️ Medir na ordem do cadastro é medir 663 caixas. Na ordem do volume transportado, doze cobrem um
 * quarto do que sai do galpão — e é por isso que a fila carrega o acumulado e diz **até onde
 * compensa**: sem a marca, a tela é uma lista longa em que ninguém sabe onde parar de descer.
 *
 * ⚠️ Empate resolvido pelo id: sem desempate estável a fila troca de ordem entre duas leituras da
 * mesma tela, e o conferente perde o lugar onde estava.
 */
export function buildMeasurementQueue(input: {
  readonly coverageTarget?: number
  readonly items: readonly MeasurementQueueItem[]
}): MeasurementQueue {
  const target = input.coverageTarget ?? DEFAULT_COVERAGE_TARGET
  const ordered = [...input.items].sort(
    (first, second) =>
      second.transportedVolumes - first.transportedVolumes || first.id.localeCompare(second.id),
  )
  const totalVolumes = ordered.reduce((total, item) => total + item.transportedVolumes, 0)

  let accumulated = 0
  let covered = 0
  const entries = ordered.map((item, index) => {
    accumulated += item.transportedVolumes
    /** Nada transportado é denominador zero: dividir daria `NaN` em toda a coluna de porcentagem. */
    const share = totalVolumes === 0 ? 0 : item.transportedVolumes / totalVolumes
    const cumulativeShare = totalVolumes === 0 ? 0 : accumulated / totalVolumes
    /** A primeira linha sempre compensa: senão a cobertura sairia vazia por uma caixa dominante. */
    const withinCoverage = totalVolumes > 0 && (index === 0 || cumulativeShare - share < target)
    if (withinCoverage) covered += 1
    return { ...item, cumulativeShare, share, withinCoverage }
  })

  return { coveredCount: covered, entries, totalVolumes }
}

/**
 * O GTIN do **produto** a partir da etiqueta que o conferente bipou (spec 085 G005).
 *
 * ⚠️ A caixa costuma trazer DUN-14, e o cadastro casa pelo GTIN-13 do produto — medido em 90% das
 * caixas desta base. Sem reduzir, o leitor acha a etiqueta e a busca não acha o produto. GTIN-8 e
 * GTIN-12 existem na prateleira e **não** são DUN: passam intactos.
 */
export function reduceToGtin13(scanned: string): string | null {
  const digits = scanned.trim()
  if (!/^[0-9]+$/.test(digits)) return null
  if (digits.length === 8 || digits.length === 12 || digits.length === 13) return digits
  if (digits.length !== 14) return null

  const base = digits.slice(1, 13)
  return `${base}${computeCheckDigit(base)}`
}

/** Dígito verificador do GS1: soma ponderada 3/1 da direita para a esquerda, complemento de dez. */
function computeCheckDigit(base: string): number {
  let sum = 0
  for (let index = base.length - 1; index >= 0; index -= 1) {
    const digit = Number(base[index])
    sum += (base.length - index) % 2 === 1 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

/**
 * ⚠️ **Não existe ordenação "pendentes primeiro", e a ausência é decisão.** Ela foi escrita e
 * removida no mesmo dia: com 663 caixas por medir e cinco medidas, pôr as pendentes na frente
 * empurrava toda medida para além das cinquenta da página, e a opção "Todas" ficava idêntica a
 * "Faltam medir" — a ordem por prioridade escondia justamente o que aquela opção existe para
 * mostrar. Quem separa as duas coisas é o **filtro de situação**, não a ordem.
 *
 * A ordem é sempre a do volume transportado, e é a mesma que dá sentido à fatia e ao acumulado.
 */
