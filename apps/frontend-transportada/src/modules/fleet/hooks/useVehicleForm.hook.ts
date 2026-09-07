/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  clearFormDraft,
  readFormDraft,
  resolveFormDraftStorage,
  writeFormDraft,
} from '@/modules/shared/formDraft.service'

import { VEHICLE_FORM_KEYS } from '../shared/fleet.constant'

import type {
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFormState,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import { resolveFleetFeedbackKey } from '../shared/fleetFeedback.service'
import { createVehicleDraft, toVehicleBody, toVehicleFormState } from '../shared/fleetForm.service'
import { resolveSecondaryFuelDefaults } from '../shared/fuelArrangement.service'
import { resolveVehicleBrandDefaults } from '../shared/vehicleBrandDefaults.service'
import {
  applyVehicleSuggestion,
  resolveVehicleSuggestion,
  type VehicleReference,
  type VehicleSuggestionOrigin,
} from '../shared/vehicleSuggestion.service'
import { listIncompleteVehicleOwnerFields } from '../shared/vehicleOwner.service'
import { resolveVehicleTypeDefaults } from '../shared/vehicleTypeAxles.service'

const OWNER_INCOMPLETE_FEEDBACK_KEY = 'ownerIncompleteFeedback'
const VEHICLE_DRAFT_STORAGE_KEY = 'transportada.fleet.vehicle-draft'

type UseVehicleFormInput = Readonly<{
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onSaved: () => void
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  /**
   * Spec 093: o catálogo de mercado, para a ficha nascer com a medida típica do tipo. Lista vazia
   * (catálogo fora do ar) é ausência de sugestão, nunca formulário travado — cadastro não para por
   * causa de palpite.
   */
  references?: readonly VehicleReference[]
  /** A frota carregada é a fonte da ficha técnica que a marca repete — o catálogo FIPE não a tem. */
  vehicles: readonly FleetVehicleDetail[]
  vehicle?: FleetVehicleDetail
}>

export type VehicleFormController = Readonly<{
  applyDocument: (values: Partial<FleetVehicleFormState>) => void
  clear: () => void
  /** Os campos que vieram do documento, e que o formulário marca como tal — spec 048. */
  documentFields: ReadonlySet<string>
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
  /** De onde a última sugestão veio, para a tela imprimir a origem junto do número — spec 093. */
  suggestionOrigin: VehicleSuggestionOrigin | null
  /** Os campos que a sugestão preencheu, e que ainda não foram tocados pelo operador. */
  suggestedFields: ReadonlySet<string>
  submit: () => Promise<void>
}>

export function useVehicleForm(input: UseVehicleFormInput): VehicleFormController {
  // O rascunho é do cadastro novo: sobre ficha carregada ele apagaria o que está gravado
  const storage = input.vehicle === undefined ? resolveFormDraftStorage() : null
  const [state, setState] = useState<FleetVehicleFormState>(() =>
    input.vehicle === undefined
      ? createVehicleDraft(
          readFormDraft({
            fields: VEHICLE_FORM_KEYS,
            storage,
            storageKey: VEHICLE_DRAFT_STORAGE_KEY,
          }),
        )
      : toVehicleFormState(input.vehicle),
  )
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [documentFields, setDocumentFields] = useState<ReadonlySet<string>>(() => new Set())
  const [suggestedFields, setSuggestedFields] = useState<ReadonlySet<string>>(() => new Set())
  const [suggestionOrigin, setSuggestionOrigin] = useState<VehicleSuggestionOrigin | null>(null)
  const { onCreate, onSaved, onUpdate, references = [], vehicle, vehicles } = input

  /**
   * Editar à mão apaga a marca de origem: a partir daí o dado é do operador, e dizer que ele veio do
   * documento seria mentir sobre quem digitou o que.
   */
  function patch(values: Partial<FleetVehicleFormState>): void {
    setFeedbackKey(null)
    setDocumentFields((previous) => forgetTouched(previous, values))
    /**
     * Digitar num campo sugerido apaga a marca dele: a partir daí o número é do operador, e dizer
     * que ele veio do catálogo seria atribuir a medida a quem não a tirou.
     */
    setSuggestedFields((previous) => forgetTouched(previous, values))
    setState((previous) => {
      const next = { ...previous, ...values }
      // Os padrões entram por baixo do que já foi digitado: eles só alcançam campo ainda em branco
      const brandDefaults =
        values.brand === undefined && values.model === undefined
          ? {}
          : resolveVehicleBrandDefaults({ state: next, vehicles })
      // O tipo vem depois porque o eixo dele é certo, e o da frota é o que ela repetiu até agora
      const typeDefaults =
        next.vehicleType === previous.vehicleType ? {} : resolveVehicleTypeDefaults(next)
      const resolved = { ...next, ...brandDefaults, ...typeDefaults }
      // O par de combustíveis é corrigido depois dos outros defaults: trocar o primário para o
      // produto do secundário deixaria os dois tanques com o mesmo combustível
      const corrected = { ...resolved, ...resolveSecondaryFuelDefaults(resolved) }
      /**
       * ⚠️ A sugestão entra **por último e por baixo**: ela só alcança campo ainda em branco depois
       * de a herança de marca e os padrões do tipo terem falado. O veículo medido da frota já é a
       * primeira escolha dentro dela; o que sobra aqui é a média do tipo.
       */
      const suggestion = resolveVehicleSuggestion({
        brand: corrected.brand,
        model: corrected.model,
        references,
        vehicles,
        vehicleType: corrected.vehicleType,
      })
      const suggested = applyVehicleSuggestion({ state: corrected, suggestion })
      const suggestedKeys = Object.keys(suggested)
      if (suggestedKeys.length > 0) {
        setSuggestedFields((previous) => new Set([...previous, ...suggestedKeys]))
        setSuggestionOrigin(suggestion?.origin ?? null)
      }
      Object.assign(corrected, suggested)
      writeFormDraft({
        draft: corrected,
        fields: VEHICLE_FORM_KEYS,
        storage,
        storageKey: VEHICLE_DRAFT_STORAGE_KEY,
      })
      return corrected
    })
  }

  /** O documento preenche pelo mesmo caminho do operador, e só a marca de origem o distingue. */
  function applyDocument(values: Partial<FleetVehicleFormState>): void {
    patch(values)
    setDocumentFields(new Set(Object.keys(values)))
  }

  /** Limpar é o formulário em branco de novo — e o rascunho vai junto, senão ele voltaria sozinho. */
  function clear(): void {
    setFeedbackKey(null)
    clearFormDraft({ storage, storageKey: VEHICLE_DRAFT_STORAGE_KEY })
    setDocumentFields(new Set())
    setSuggestedFields(new Set())
    setSuggestionOrigin(null)
    setState(createVehicleDraft())
  }

  async function submit(): Promise<void> {
    if (listIncompleteVehicleOwnerFields(state).length > 0) {
      setFeedbackKey(OWNER_INCOMPLETE_FEEDBACK_KEY)
      return
    }
    const body = toVehicleBody(state)
    setIsSaving(true)
    try {
      await (vehicle === undefined
        ? onCreate(body)
        : onUpdate({
            ...body,
            expectedVersion: vehicle.version,
            status: vehicle.status,
            vehicleId: vehicle.id,
          }))
      clearFormDraft({ storage, storageKey: VEHICLE_DRAFT_STORAGE_KEY })
      onSaved()
    } catch (error) {
      setFeedbackKey(resolveFleetFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    applyDocument,
    clear,
    documentFields,
    feedbackKey,
    isSaving,
    patch,
    state,
    submit,
    suggestedFields,
    suggestionOrigin,
  }
}

/** Campo tocado perde a marca de origem — vale para o documento e para a sugestão, pelo mesmo motivo. */
function forgetTouched(
  previous: ReadonlySet<string>,
  values: Partial<FleetVehicleFormState>,
): ReadonlySet<string> {
  const touched = Object.keys(values).filter((key) => previous.has(key))
  if (touched.length === 0) return previous
  const next = new Set(previous)
  for (const key of touched) next.delete(key)
  return next
}
