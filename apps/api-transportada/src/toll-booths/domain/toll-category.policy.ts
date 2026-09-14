/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quanto da tarifa base a cancela cobra deste veículo.
 *
 * ⚠️ **Não é o número de eixos — é a categoria.** A tarifa publicada (os R$ 10,50 de Santa Rita,
 * conferidos contra a tabela da Arteris) é a **Categoria 1**, e o multiplicador oficial depende da
 * **rodagem**, não só da contagem de eixos:
 *
 * | Cat | veículo                                   | eixos | rodagem | multiplicador |
 * |-----|-------------------------------------------|-------|---------|---------------|
 * | 1   | automóvel, caminhonete, **furgão**        | 2     | simples | 1,0           |
 * | 2   | caminhão leve, ônibus                     | 2     | dupla   | 2,0           |
 * | 3   | automóvel com reboque                     | 3     | simples | 1,5           |
 * | 4   | caminhão, caminhão-trator                 | 3     | dupla   | 3,0           |
 * | 7   | caminhão-trator com semirreboque          | 5     | dupla   | 5,0           |
 * | 9   | motocicleta                               | 2     | simples | 0,5           |
 *
 * A regra que a tabela inteira obedece: **dupla paga um por eixo; simples paga meio por eixo**; a
 * moto é o caso próprio da Categoria 9.
 *
 * ⚠️ O defeito que isto conserta: a conta multiplicava a tarifa pelos eixos **físicos**, e cobrava
 * o dobro de todo veículo de rodagem simples. Medido numa Fiorino de 2 eixos em três praças:
 * R$ 76,80 na tela contra R$ 38,40 na cancela. Medido no catálogo, `charge_car` e `charge_per_axle`
 * são o mesmo valor em **152 das 159** praças que têm os dois — porque o que o OSM publica, e o que
 * importamos, é a base da Categoria 1.
 */
import { VEHICLE_TYPES, type VehicleType } from '../../shared/vehicle-type.constant.js'
import { resolveDeclaredVehicleAxles } from './vehicle-axles.policy.js'

const VEHICLE_TYPE_SET: ReadonlySet<string> = new Set(VEHICLE_TYPES)

/** Rodagem simples é pneu único no eixo traseiro; dupla é o par que o caminhão usa. */
export const TOLL_TYRE_CONFIGURATIONS = ['single', 'dual'] as const
export type TollTyreConfiguration = (typeof TOLL_TYRE_CONFIGURATIONS)[number]

/**
 * ⚠️ **A rodagem é do VEÍCULO, e esta tabela é só o padrão do tipo.** VUC e 3/4 saem montados de
 * fábrica com rodagem **simples** no eixo traseiro na configuração mais comum, e por isso a maioria
 * das praças os cobra na Categoria 1 — não na tarifa de carga pesada. Decisão do produto, tomada
 * por escrito.
 *
 * ⚠️ **O limite disto está declarado e não é pequeno:** um VUC montado com rodado duplo existe, e
 * para ele a cancela cobra o dobro do que esta tabela prevê. Enquanto a ficha do veículo não tiver
 * a rodagem — do jeito que já tem `axle_count`, com o tipo servindo de estimativa —, o padrão do
 * tipo é o que há, e ele erra **para baixo** nesse caso. Ver a nota no fim do arquivo.
 *
 * `other` fica em **dupla**, mantendo o que a conta já fazia: o piso continua sendo o menor
 * caminhão, como a referência de eixos ao lado sempre decidiu. Mudá-lo mexeria no custo de todo
 * veículo sem tipo declarado sem ninguém pedir.
 */
const TYRE_BY_VEHICLE_TYPE: Readonly<Record<VehicleType, TollTyreConfiguration>> = {
  car: 'single',
  motorcycle: 'single',
  other: 'dual',
  three_quarter: 'single',
  toco: 'dual',
  tractor_unit: 'dual',
  truck: 'dual',
  utility: 'single',
  van: 'single',
  vuc: 'single',
}

export function resolveTollTyreConfiguration(vehicleType: VehicleType): TollTyreConfiguration {
  return TYRE_BY_VEHICLE_TYPE[vehicleType]
}

/**
 * O multiplicador da tarifa base, como fração exata — nunca como decimal binário.
 *
 * ⚠️ Ele é **racional de propósito**: a Categoria 3 é 1,5 e a 9 é 0,5, e um `number` traria erro de
 * ponto flutuante para dentro de conta de dinheiro. Quem multiplica usa o par inteiro.
 */
export type TollMultiplier = Readonly<{ denominator: number; numerator: number }>

export function resolveTollMultiplier(input: {
  readonly axleCount: number
  readonly vehicleType: VehicleType
}): TollMultiplier {
  /** Categoria 9: a moto tem dois eixos e paga meia tarifa — não é "metade por eixo". */
  if (input.vehicleType === 'motorcycle') return { denominator: 2, numerator: 1 }

  return resolveTollTyreConfiguration(input.vehicleType) === 'dual'
    ? { denominator: 1, numerator: input.axleCount }
    : { denominator: 2, numerator: input.axleCount }
}

/**
 * O multiplicador do veículo como ele está cadastrado — o par de `resolveDeclaredVehicleAxles`, e
 * resolvido **junto** dele.
 *
 * ⚠️ Os dois andam sempre juntos: sem eixo não há multiplicador, e o `null` de um é o `null` do
 * outro. Separá-los deixaria a conta somar com um e a tela explicar com o outro.
 *
 * ⚠️ Tipo fora do catálogo — o `''` do implemento, que não traciona — cai no piso de `other`, que é
 * rodagem dupla. É o que a referência de eixos ao lado já fazia; mudar isso mexeria calado no custo
 * de todo veículo sem tipo reconhecido.
 */
export function resolveDeclaredTollMultiplier(input: {
  readonly axleCount: number
  readonly vehicleType: string
}): TollMultiplier | null {
  const axles = resolveDeclaredVehicleAxles(input)
  if (axles === null) return null

  return resolveTollMultiplier({
    axleCount: axles.count,
    vehicleType: VEHICLE_TYPE_SET.has(input.vehicleType)
      ? (input.vehicleType as VehicleType)
      : 'other',
  })
}

/** O rótulo da fração para a tela: `1`, `1,5`, `3`. Quem traduz o texto ao redor é o frontend. */
export function formatTollMultiplier(multiplier: TollMultiplier): string {
  const whole = Math.trunc(multiplier.numerator / multiplier.denominator)
  const remainder = multiplier.numerator % multiplier.denominator
  if (remainder === 0) return String(whole)

  /** Só a metade aparece na tabela oficial, e ela vira uma casa decimal — nunca uma dízima. */
  return `${whole + remainder / multiplier.denominator}`.replace('.', ',')
}

/**
 * ⚠️ **O que falta para esta política deixar de ser padrão de tipo.** A rodagem é uma escolha de
 * montagem, não uma propriedade do tipo: `fleet_vehicles` precisa de uma coluna própria, do mesmo
 * feitio de `axle_count` — declarada vence, tipo estima, e a tela imprime a marca. Sem ela, o VUC
 * montado com rodado duplo é cobrado pela metade nesta conta.
 */
