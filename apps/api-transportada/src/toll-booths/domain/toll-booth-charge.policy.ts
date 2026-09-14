/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O `charge` do OSM é uma lista `;`-separada de `<valor><moeda>/<classe de veículo>`, por exemplo
 * `10.50BRL/motorcar;5.30BRL/motorcycle;10.50BRL/hgv/axle`. Esta spec só quer duas classes:
 * `motorcar` (o veículo leve da frota) e `hgv/axle` (o que o caminhão paga **por eixo**).
 *
 * Medido no extract real (166 praças): 163 trazem `charge`, 162 trazem `hgv/axle` — uma praça declara
 * só `hgv` (sem `/axle`), e ali `chargePerAxle` fica nulo de propósito, porque a tarifa por eixo
 * não é a mesma coisa que a tarifa fixa de caminhão.
 */
export type TollBoothCharge = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
}>

const CHARGE_SEGMENT_PATTERN = /^(\d+(?:\.\d+)?)[A-Z]+\/(.+)$/u

const MOTORCAR_CLASS = 'motorcar'
const HGV_AXLE_CLASS = 'hgv/axle'

export function parseTollBoothCharge(charge: string | undefined): TollBoothCharge {
  if (charge === undefined || charge.trim().length === 0) {
    return { chargeCar: null, chargePerAxle: null }
  }

  let chargeCar: null | string = null
  let chargePerAxle: null | string = null

  for (const segment of charge.split(';')) {
    const match = CHARGE_SEGMENT_PATTERN.exec(segment.trim())
    if (match === null) continue

    const [, value, vehicleClass] = match
    if (vehicleClass === MOTORCAR_CLASS) chargeCar = value ?? null
    if (vehicleClass === HGV_AXLE_CLASS) chargePerAxle = value ?? null
  }

  return { chargeCar, chargePerAxle }
}
