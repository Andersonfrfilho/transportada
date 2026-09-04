/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'FLEET_VEHICLE_CAPACITY'
const VOLUME_SCALE = 6n
const VOLUME_FACTOR = 10n ** VOLUME_SCALE

/**
 * Spec 075 RF3: três degraus, e só o primeiro é medida.
 *
 * ⚠️ A referência por tipo é o **último** recurso e é palpite fraco: a dispersão dentro de um tipo
 * chega a 2× — um VUC existe de 13 e de 26 m³, conforme o baú. Por isso ela nunca vence a ficha, e
 * a origem viaja com o valor para a tela poder dizer que aquilo é referência, não medida.
 */
export const VEHICLE_CAPACITY_SOURCE = {
  /** `comprimento × largura × altura` da ficha — quem mediu o baú sabe mais que qualquer tabela. */
  measured: 'measured',
  /** O `capacity_m3` que alguém digitou na ficha. Veículo antigo tem isto e não tem as medidas. */
  declared: 'declared',
  /** A referência do tipo. Palpite, e a tela precisa dizer que é. */
  reference: 'reference',
} as const

export type VehicleCapacitySource =
  (typeof VEHICLE_CAPACITY_SOURCE)[keyof typeof VEHICLE_CAPACITY_SOURCE]

export type ResolveVehicleCapacityParams = {
  readonly capacityM3: string | null
  readonly cargoHeightM: string | null
  readonly cargoLengthM: string | null
  readonly cargoWidthM: string | null
  readonly referenceM3: string | null
}

export type ResolvedVehicleCapacity = {
  readonly capacityM3: string
  readonly source: VehicleCapacitySource
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

function format(value: bigint): string {
  return formatScaledDecimal(value, VOLUME_SCALE)
}

/**
 * `null` quando nenhum degrau responde — nunca zero. A tela lê ausência como "não dá para dizer" e
 * zero como "baú sem espaço", e as duas levam a decisões opostas na hora de carregar.
 */
export function resolveVehicleCapacity({
  capacityM3,
  cargoHeightM,
  cargoLengthM,
  cargoWidthM,
  referenceM3,
}: ResolveVehicleCapacityParams): ResolvedVehicleCapacity | null {
  const length = toScaled(cargoLengthM)
  const width = toScaled(cargoWidthM)
  const height = toScaled(cargoHeightM)
  /** Dimensão pela metade não estima: duas medidas e um palpite não são um volume. */
  if (length > 0n && width > 0n && height > 0n) {
    const area = divideHalfUp(length * width, VOLUME_FACTOR)
    return {
      capacityM3: format(divideHalfUp(area * height, VOLUME_FACTOR)),
      source: VEHICLE_CAPACITY_SOURCE.measured,
    }
  }

  const declared = toScaled(capacityM3)
  if (declared > 0n) {
    return { capacityM3: format(declared), source: VEHICLE_CAPACITY_SOURCE.declared }
  }

  const reference = toScaled(referenceM3)
  if (reference > 0n) {
    return { capacityM3: format(reference), source: VEHICLE_CAPACITY_SOURCE.reference }
  }

  return null
}

export type VolumeReferenceCandidate = {
  readonly bodyType: string
  readonly role: 'traction' | 'trailer'
  readonly vehicleType: string
}

export type VolumeReferenceKey = {
  readonly bodyType: string
  readonly vehicleType: string
}

/**
 * Spec 075 D2b: **quem responde pela cubagem e quem carrega**, nao quem traciona.
 *
 * Com carreta acoplada a carga vai na carreta, e a linha dela e `('', '02')` para bau ou
 * `('', '05')` para sider — no nosso modelo o implemento tem `vehicle_type` **vazio**, porque o
 * tipo pertence a quem traciona. Indexar por `vehicle_type` sozinho faria o cavalo responder pela
 * capacidade de uma carga que ele nao leva.
 *
 * A chave sai daqui mesmo quando nao existe linha para ela (`three_quarter`, por exemplo): quem
 * consulta decide o que fazer com a ausencia, e a ausencia significa ocupacao nao exibida.
 */
export function resolveVolumeReferenceKey(input: {
  readonly traction: VolumeReferenceCandidate
  readonly trailer: VolumeReferenceCandidate | null
}): VolumeReferenceKey {
  const carrier = input.trailer ?? input.traction
  return { bodyType: carrier.bodyType, vehicleType: carrier.vehicleType }
}
