/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetVehicleDetail, FleetVehicleFormState } from './fleet.types'
import { resolveSecondaryFuelDefaults } from './fuelArrangement.service'
import { resolveVehicleBrandDefaults } from './vehicleBrandDefaults.service'
import {
  applyVehicleSuggestion,
  resolveVehicleSuggestion,
  type VehicleReference,
  type VehicleSuggestionOrigin,
} from './vehicleSuggestion.service'
import { resolveVehicleTypeDefaults } from './vehicleTypeAxles.service'

/**
 * Os três campos que **pedem** a sugestão. Fora deles a sugestão não roda, e é isso que permite
 * apagar um campo sugerido: sem gatilho, o campo em branco continua em branco.
 */
const SUGGESTION_TRIGGERS = ['brand', 'model', 'vehicleType'] as const

export type ComposedVehicleFormPatch = Readonly<{
  origin: VehicleSuggestionOrigin | null
  state: FleetVehicleFormState
  suggestedFields: readonly string[]
}>

/**
 * A composição de um `patch` do formulário de veículo, **pura**: os padrões da marca, os do tipo, a
 * correção do par de combustíveis e a sugestão de baú, nesta ordem, cada camada entrando por baixo
 * do que já está preenchido.
 *
 * ⚠️ Vive fora do hook porque o resultado é lido em dois lugares — o estado e a marca de origem — e
 * chamar `setState` de outro estado de dentro do updater de `setState` é o que quebrava aqui: o
 * updater precisa ser puro, e em StrictMode ele roda duas vezes.
 */
export function composeVehicleFormPatch(
  input: Readonly<{
    previous: FleetVehicleFormState
    references: readonly VehicleReference[]
    /**
     * ⚠️ Falso na **edição** de uma ficha gravada. Veículo antigo sem baú medido tem os três campos
     * vazios, e sem esta trava mexer na cor injetaria a média do tipo neles — o operador salvaria a
     * correção de cor levando junto três medidas que ninguém tirou, e a planta passaria a desenhar
     * metros sobre um palpite.
     */
    suggestionEnabled: boolean
    values: Partial<FleetVehicleFormState>
    vehicles: readonly FleetVehicleDetail[]
  }>,
): ComposedVehicleFormPatch {
  const next = { ...input.previous, ...input.values }
  // Os padrões entram por baixo do que já foi digitado: eles só alcançam campo ainda em branco
  const brandDefaults =
    input.values.brand === undefined && input.values.model === undefined
      ? {}
      : resolveVehicleBrandDefaults({ state: next, vehicles: input.vehicles })
  // O tipo vem depois porque o eixo dele é certo, e o da frota é o que ela repetiu até agora
  const typeDefaults =
    next.vehicleType === input.previous.vehicleType ? {} : resolveVehicleTypeDefaults(next)
  const resolved = { ...next, ...brandDefaults, ...typeDefaults }
  // O par de combustíveis é corrigido depois dos outros defaults: trocar o primário para o
  // produto do secundário deixaria os dois tanques com o mesmo combustível
  const corrected = { ...resolved, ...resolveSecondaryFuelDefaults(resolved) }

  /**
   * ⚠️ A sugestão só roda quando o operador **muda o tipo, a marca ou o modelo** — nunca em todo
   * `patch`. Rodando sempre, limpar um campo sugerido o repunha no mesmo ciclo, e o valor voltava
   * sem a marca de origem (que `forgetTouched` acabara de remover): impossível de apagar, e
   * indistinguível de uma medição.
   */
  const isTriggered = SUGGESTION_TRIGGERS.some((field) => input.values[field] !== undefined)
  if (!input.suggestionEnabled || !isTriggered) {
    return { origin: null, state: corrected, suggestedFields: [] }
  }

  const suggestion = resolveVehicleSuggestion({
    brand: corrected.brand,
    model: corrected.model,
    references: input.references,
    vehicles: input.vehicles,
    vehicleType: corrected.vehicleType,
  })
  const suggested = applyVehicleSuggestion({ state: corrected, suggestion })
  const suggestedFields = Object.keys(suggested)

  return {
    origin: suggestedFields.length === 0 ? null : (suggestion?.origin ?? null),
    state: { ...corrected, ...suggested },
    suggestedFields,
  }
}
