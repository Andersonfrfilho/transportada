/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isZeroAmount, toTypedMeasure } from '@/modules/shared/decimalAmount.service'

import { VEHICLE_MEASURE_FIELD_SCALE } from './fleetVehicleMeasure.service'
import { normalizeVehicleCatalogName } from './vehicleCatalogChoices.service'
import type { FleetVehicleDetail } from './fleet.types'
import type { VehicleType } from '@/modules/shared/vehicleType.constant'

/** Uma linha do catálogo de mercado, como a API a serve. */
export type VehicleReference = Readonly<{
  bodyType: string
  cargoHeightM: string
  cargoLengthM: string
  cargoWidthM: string
  maxPayloadKg: string | null
  vehicleType: VehicleType | ''
}>

/**
 * De onde a sugestão veio. ⚠️ Ela **viaja sempre junto do valor**, nunca ao lado num segundo campo
 * que a tela possa esquecer de imprimir: um número plausível sem origem é o modo de falha que a
 * ADR-0044 §1 nomeia, e aqui ele acabaria virando metro na planta do baú.
 */
export type VehicleSuggestionOrigin =
  | Readonly<{ kind: 'reference' }>
  | Readonly<{ kind: 'vehicle'; plate: string }>

export type VehicleSuggestion = Readonly<{
  capacityKilograms: string
  cargoHeightMeters: string
  cargoLengthMeters: string
  cargoWidthMeters: string
  origin: VehicleSuggestionOrigin
}>

/**
 * A medida com que a ficha nasce, para o operador **conferir** em vez de medir do zero.
 *
 * Precedência: **veículo da frota com a mesma marca e o mesmo modelo, já medido → referência do tipo
 * → ausência**. O veículo vence porque é o baú de um implementador que já trabalhou para esta frota;
 * a referência é média de mercado, e a dispersão dentro de um tipo chega a 2× (a van vai de 7,0 a
 * 15,5 m³ na mesma sigla).
 *
 * ⚠️ **Marca sozinha não herda medida**, ao contrário de `resolveVehicleBrandDefaults`, que cai para
 * a marca quando não acha o modelo. O baú é montado por um implementador **depois** do chassi: dois
 * caminhões da mesma marca e modelos diferentes não têm o mesmo compartimento, e ali o erro deixa de
 * ser uma porcentagem e vira o metro que a planta desenha.
 *
 * ⚠️ **Devolve tudo ou nada nas três dimensões.** Duas medidas e um palpite não são um volume — é a
 * mesma exigência que `hasCargoDimensions` faz do outro lado.
 *
 * `car` e `tractor_unit` não têm sugestão, e a ausência é o resultado certo: o carro de passeio não
 * tem compartimento de carga publicado (o que existe é volume de porta-malas, outra grandeza), e o
 * cavalo mecânico não tem baú próprio — o volume é do implemento.
 */
export function resolveVehicleSuggestion(
  input: Readonly<{
    brand: string
    model: string
    references: readonly VehicleReference[]
    vehicles: readonly FleetVehicleDetail[]
    vehicleType: VehicleType | ''
  }>,
): VehicleSuggestion | null {
  return fromMeasuredVehicle(input) ?? fromReference(input)
}

function fromMeasuredVehicle(
  input: Readonly<{
    brand: string
    model: string
    vehicles: readonly FleetVehicleDetail[]
  }>,
): VehicleSuggestion | null {
  const brand = normalizeVehicleCatalogName(input.brand)
  const model = normalizeVehicleCatalogName(input.model)
  if (brand === '' || model === '') return null

  const measured = input.vehicles.filter(
    (vehicle) =>
      normalizeVehicleCatalogName(vehicle.brand) === brand &&
      normalizeVehicleCatalogName(vehicle.model) === model &&
      hasEveryDimension(vehicle),
  )
  /** O mais recente reflete o implemento que a frota compra hoje, não o de quatro anos atrás. */
  const source = measured.reduce<FleetVehicleDetail | undefined>(
    (latest, vehicle) =>
      latest === undefined || vehicle.createdAt > latest.createdAt ? vehicle : latest,
    undefined,
  )
  if (source === undefined) return null

  return {
    capacityKilograms: toFormMeasure(source.capacityKilograms),
    cargoHeightMeters: toFormMeasure(source.cargoHeightMeters),
    cargoLengthMeters: toFormMeasure(source.cargoLengthMeters),
    cargoWidthMeters: toFormMeasure(source.cargoWidthMeters),
    origin: { kind: 'vehicle', plate: source.plate },
  }
}

function fromReference(
  input: Readonly<{
    references: readonly VehicleReference[]
    vehicleType: VehicleType | ''
  }>,
): VehicleSuggestion | null {
  /**
   * ⚠️ Só o tipo casa, nunca a carroceria: a ficha ainda não tem `bodyType` decidido quando o
   * operador escolhe o tipo, e o catálogo tem `02` para todos os tipos com dado. O implemento
   * (`vehicleType` vazio) fica de fora — sugerir 14 m de baú a quem ainda não escolheu tipo nenhum
   * seria preencher a ficha inteira com o maior número da tabela.
   */
  if (input.vehicleType === '') return null

  const reference = input.references.find(
    (candidate) => candidate.vehicleType === input.vehicleType,
  )
  if (reference === undefined) return null

  return {
    capacityKilograms: reference.maxPayloadKg === null ? '' : toFormMeasure(reference.maxPayloadKg),
    cargoHeightMeters: toFormMeasure(reference.cargoHeightM),
    cargoLengthMeters: toFormMeasure(reference.cargoLengthM),
    cargoWidthMeters: toFormMeasure(reference.cargoWidthM),
    origin: { kind: 'reference' },
  }
}

function hasEveryDimension(
  vehicle: Readonly<{
    cargoHeightMeters: string
    cargoLengthMeters: string
    cargoWidthMeters: string
  }>,
): boolean {
  return (
    !isZeroAmount(vehicle.cargoLengthMeters) &&
    !isZeroAmount(vehicle.cargoWidthMeters) &&
    !isZeroAmount(vehicle.cargoHeightMeters)
  )
}

function toFormMeasure(value: string): string {
  return toTypedMeasure({ scale: VEHICLE_MEASURE_FIELD_SCALE.cargoLengthMeters.form, value })
}

/** Os quatro campos que a sugestão alcança. Fora daqui, nada é preenchido por palpite. */
export const VEHICLE_SUGGESTION_FIELDS = [
  'cargoLengthMeters',
  'cargoWidthMeters',
  'cargoHeightMeters',
  'capacityKilograms',
] as const
export type VehicleSuggestionField = (typeof VEHICLE_SUGGESTION_FIELDS)[number]

/**
 * A sugestão entra **só em campo em branco**, como os padrões de marca ao lado dela: o que o
 * operador digitou manda, e trocar o tipo depois de medir não apaga a fita de ninguém.
 *
 * Campo a campo, e não tudo-ou-nada: quem digitou o comprimento e parou ainda ganha a largura e a
 * altura sugeridas — e a planta só nasce com as três, então uma medida solta não desenha nada.
 */
export function applyVehicleSuggestion(
  input: Readonly<{
    state: Readonly<Record<VehicleSuggestionField, string>>
    suggestion: VehicleSuggestion | null
  }>,
): Partial<Record<VehicleSuggestionField, string>> {
  if (input.suggestion === null) return {}

  const applied: Partial<Record<VehicleSuggestionField, string>> = {}
  for (const field of VEHICLE_SUGGESTION_FIELDS) {
    const candidate = input.suggestion[field]
    if (candidate === '' || input.state[field] !== '') continue
    applied[field] = candidate
  }

  return applied
}
