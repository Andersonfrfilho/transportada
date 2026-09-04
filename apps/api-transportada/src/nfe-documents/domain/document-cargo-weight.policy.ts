/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso de uma **nota**, com a origem junto. `cargo-weight.policy.ts` decide por volume; esta
 * decide pela nota inteira, e é ela que a tela consome.
 *
 * A regra de agregação já existia, mas enterrada numa consulta de emissão de CT-e
 * (`applyEstimatedVolumeWeights`): quem quisesse mostrar peso em qualquer outra superfície teria de
 * reimplementá-la, e a segunda implementação discordaria da primeira sem nada falhar.
 *
 * ⚠️ **Não existe peso por item.** `nfe_products` guarda código, descrição, NCM, CFOP, quantidade,
 * unidade e valores — nenhuma massa (medido em 02/09/2026). O degrau "somar os itens" que a spec
 * imaginava não tem de onde sair, e a ordem é a que a ADR-0052 decidiu: `pesoB` → `qVol` × padrão
 * da empresa → ausência.
 */
import { CARGO_WEIGHT_SOURCE, resolveCargoWeight } from './cargo-weight.policy.js'
import type { CargoWeightSource } from './cargo-weight.policy.js'
import { formatScaledDecimal, parseScaledDecimal } from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'NFE_CARGO_WEIGHT'
const WEIGHT_SCALE = 4n

export type DocumentCargoVolume = {
  readonly grossWeight: string | null
  readonly quantity: string | null
}

export type ResolveDocumentCargoWeightParams = {
  readonly defaultWeightPerVolume: string | null
  readonly volumes: readonly DocumentCargoVolume[]
}

export type ResolvedDocumentCargoWeight = {
  readonly grossWeight: string
  readonly source: CargoWeightSource
}

function scaled(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: WEIGHT_SCALE, value })
}

/**
 * Nota com **algum** volume pesado não é estimada — nem no volume que veio zerado. O emitente omite
 * `pesoB` por nota, não por política: a Zaragoza mandou 883658 com 108,670 kg e 883663 com 0,000 no
 * mesmo caminhão, mesmo lacre, mesmo minuto. Completar o volume vazio com o padrão da empresa
 * misturaria estimativa dentro de uma soma que a tela apresentaria como declarada.
 */
export function resolveDocumentCargoWeight({
  defaultWeightPerVolume,
  volumes,
}: ResolveDocumentCargoWeightParams): null | ResolvedDocumentCargoWeight {
  const declared = volumes
    .map((volume) =>
      resolveCargoWeight({
        defaultWeightPerVolume: null,
        volumeGrossWeight: volume.grossWeight,
        volumeQuantity: volume.quantity,
      }),
    )
    .filter((resolved) => resolved !== null)

  if (declared.length > 0) {
    return {
      grossWeight: formatScaledDecimal(
        declared.reduce((total, resolved) => total + scaled(resolved.grossWeight), 0n),
        WEIGHT_SCALE,
      ),
      source: CARGO_WEIGHT_SOURCE.xml,
    }
  }

  const estimated = volumes
    .map((volume) =>
      resolveCargoWeight({
        defaultWeightPerVolume,
        volumeGrossWeight: volume.grossWeight,
        volumeQuantity: volume.quantity,
      }),
    )
    .filter((resolved) => resolved !== null)

  if (estimated.length === 0) return null

  return {
    grossWeight: formatScaledDecimal(
      estimated.reduce((total, resolved) => total + scaled(resolved.grossWeight), 0n),
      WEIGHT_SCALE,
    ),
    source: CARGO_WEIGHT_SOURCE.estimated,
  }
}
