/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { AssemblyMapNote } from './assemblyMap.service'

/**
 * As três grandezas que a linha da parada passou a imprimir: quanto a nota vale, quanto ela pesa e
 * quanto de frete ela rende. Elas moram aqui, e não no componente, porque o teste desta app não tem
 * DOM — o que se prova é a função.
 */

export type AssemblyNoteRevenue = Readonly<{
  amount: string
  /** `measured` é cálculo já gravado; `estimated` é a regra aplicada agora, na prévia. */
  isEstimated: boolean
  /**
   * Qual parametrização produziu o número, e a que percentual — `null` na linha realizada, que veio
   * do CT-e já emitido e não de uma regra aplicada agora.
   *
   * ⚠️ É a regra de **frete**, não o perfil de emissão: neste caminho o perfil não entra. Quem
   * escolhe o perfil pelo CNPJ é a emissão do CT-e; aqui quem precifica é `findApplicableRule`.
   */
  ruleName: null | string
  percentage: null | string
}>

export type AssemblyRevenueLine = Readonly<{
  amount: string
  freightRuleName?: null | string
  nfeDocumentId: null | string
  percentage?: null | string
  source: 'estimated' | 'measured' | 'missing' | 'period'
}>

export type AssemblyWeightTotal = Readonly<{
  isEstimated: boolean
  weight: string
}>

/**
 * A receita daquela nota, quando a conta da viagem soube produzi-la.
 *
 * ⚠️ `missing` **vira ausência, não zero**. A avaliação devolve `0` com a razão da lacuna ao lado —
 * "sem regra de frete para o destino" —, e imprimir esse zero numa coluna de dinheiro diria que a
 * nota não rende nada, que é uma afirmação diferente de "ninguém sabe quanto ela rende". É a mesma
 * escolha do peso ausente, que sai como célula vazia.
 */
export function resolveNoteRevenue(
  input: Readonly<{
    /** O previsto que a listagem calculou, usado quando a avaliação ainda não foi consultada. */
    fallback?: Readonly<{ amount: null | string; ruleName: null | string }> | undefined
    nfeDocumentId: string
    revenueLines: readonly AssemblyRevenueLine[]
  }>,
): AssemblyNoteRevenue | null {
  const line = input.revenueLines.find(
    (candidate) => candidate.nfeDocumentId === input.nfeDocumentId,
  )
  /**
   * ⚠️ Sem avaliação — que só é consultada depois de escolher o veículo — cai no previsto da
   * listagem. As duas contas usam a mesma ordem de preferência entre regras e a mesma recusa por
   * empate, então a base não contradiz o que aparece depois; ela só chega antes.
   *
   * `missing` continua virando ausência: ali a avaliação **sabe** que não há regra para o destino,
   * e essa resposta vence um palpite anterior.
   */
  if (line === undefined) {
    const amount = input.fallback?.amount ?? null
    if (amount === null) return null
    return {
      amount,
      isEstimated: true,
      percentage: null,
      ruleName: input.fallback?.ruleName ?? null,
    }
  }
  if (line.source === 'missing') return null

  return {
    amount: line.amount,
    isEstimated: line.source !== 'measured',
    percentage: line.percentage ?? null,
    ruleName: line.freightRuleName ?? null,
  }
}

/**
 * O peso somado das notas da seleção.
 *
 * ⚠️ **Uma nota estimada torna o total estimado.** É a mesma regra da ocupação do baú: somar palpite
 * com massa medida produz um número cuja natureza é a do pior componente, e um total sem marca faz
 * quem carrega o caminhão confiar em quilo que ninguém pesou. Seleção em que nenhuma nota tem peso
 * é `null` — nunca zero, que declararia que a carga não pesa nada.
 */
export function totalAssemblyWeight(
  notes: readonly Pick<AssemblyMapNote, 'cargoGrossWeight' | 'cargoWeightSource'>[],
): AssemblyWeightTotal | null {
  const weighed = notes.filter((note) => note.cargoGrossWeight !== null)
  if (weighed.length === 0) return null

  return {
    isEstimated: weighed.some((note) => note.cargoWeightSource === 'estimated'),
    weight: sumScaledAmounts(weighed.map((note) => note.cargoGrossWeight ?? '0')),
  }
}

/**
 * O valor somado das notas da seleção. Ausência de valor não existe na prática — `totalAmount` é
 * obrigatório na nota —, mas a soma aceita a lacuna em vez de quebrar a tela por um campo nulo.
 */
/**
 * O frete previsto somado da seleção. Ele é **rotulado à parte** dos totais de valor e peso: receita
 * e valor de mercadoria são naturezas diferentes, e uma fileira de números sem rótulo faria as duas
 * parecerem a mesma coisa. Nota sem frete resolvido simplesmente não entra na soma.
 */
export function totalAssemblyFreight(
  notes: readonly Pick<AssemblyMapNote, 'freightAmount'>[],
): string | null {
  const priced = notes.filter((note) => note.freightAmount !== null)
  if (priced.length === 0) return null

  return sumScaledAmounts(priced.map((note) => note.freightAmount ?? '0'))
}

export function totalAssemblyAmount(
  notes: readonly Pick<AssemblyMapNote, 'totalAmount'>[],
): string | null {
  const valued = notes.filter((note) => note.totalAmount !== null)
  if (valued.length === 0) return null

  return sumScaledAmounts(valued.map((note) => note.totalAmount ?? '0'))
}

/**
 * `0.045000` vira `4,5%`. A conversão é **textual**, não aritmética: o percentual é decimal fiscal,
 * e passá-lo por `Number` traria erro binário para dentro de um rótulo que a pessoa vai conferir
 * contra o contrato dela.
 */
export function formatRulePercentage(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.')
  const digits = `${whole}${fraction.padEnd(6, '0').slice(0, 6)}`.replace(/^0+(?=\d)/, '')
  const shifted = digits.padStart(6, '0')
  const integerPart = shifted.slice(0, shifted.length - 4).replace(/^0+(?=\d)/, '')
  const decimalPart = shifted.slice(shifted.length - 4).replace(/0+$/, '')

  return decimalPart === '' ? `${integerPart}%` : `${integerPart},${decimalPart}%`
}
