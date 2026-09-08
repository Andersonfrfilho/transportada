/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  clearFormDraft,
  readFormDraft,
  resolveFormDraftStorage,
  writeFormDraft,
} from '@/modules/shared/formDraft.service'

import { VEHICLE_DRAFT_FORM_KEYS } from '../shared/fleet.constant'

import type {
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFormState,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import { resolveFleetFeedbackKey } from '../shared/fleetFeedback.service'
import { createVehicleDraft, toVehicleBody, toVehicleFormState } from '../shared/fleetForm.service'
import { composeVehicleFormPatch } from '../shared/vehicleFormPatch.service'
import type { VehicleReference, VehicleSuggestionOrigin } from '../shared/vehicleSuggestion.service'
import { listIncompleteVehicleOwnerFields } from '../shared/vehicleOwner.service'

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
            fields: VEHICLE_DRAFT_FORM_KEYS,
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

    /**
     * ⚠️ A composição roda **fora** do updater, sobre o estado deste render: o updater precisa ser
     * puro, e chamar `setSuggestedFields` de dentro dele deixava a marca de origem dessincronizada
     * dos valores aplicados — em StrictMode o React executa o updater duas vezes.
     */
    const composed = composeVehicleFormPatch({
      previous: state,
      references,
      suggestionEnabled: vehicle === undefined,
      values,
      vehicles,
    })
    if (composed.suggestedFields.length > 0) {
      setSuggestedFields((previous) => new Set([...previous, ...composed.suggestedFields]))
      setSuggestionOrigin(composed.origin)
    }

    setState((previous) => {
      const draft = composeVehicleFormPatch({
        previous,
        references,
        suggestionEnabled: vehicle === undefined,
        values,
        vehicles,
      }).state
      writeFormDraft({
        draft,
        /** O booleano da tag não cabe no rascunho, que só guarda string (spec 095 D3). */
        fields: VEHICLE_DRAFT_FORM_KEYS,
        storage,
        storageKey: VEHICLE_DRAFT_STORAGE_KEY,
      })
      return draft
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
