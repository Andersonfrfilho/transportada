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
import { listIncompleteVehicleOwnerFields } from '../shared/vehicleOwner.service'
import { resolveVehicleTypeDefaults } from '../shared/vehicleTypeAxles.service'

const OWNER_INCOMPLETE_FEEDBACK_KEY = 'ownerIncompleteFeedback'
const VEHICLE_DRAFT_STORAGE_KEY = 'transportada.fleet.vehicle-draft'

type UseVehicleFormInput = Readonly<{
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onSaved: () => void
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  /** A frota carregada é a fonte da ficha técnica que a marca repete — o catálogo FIPE não a tem. */
  vehicles: readonly FleetVehicleDetail[]
  vehicle?: FleetVehicleDetail
}>

export type VehicleFormController = Readonly<{
  clear: () => void
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
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
  const { onCreate, onSaved, onUpdate, vehicle, vehicles } = input

  function patch(values: Partial<FleetVehicleFormState>): void {
    setFeedbackKey(null)
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
      writeFormDraft({
        draft: corrected,
        fields: VEHICLE_FORM_KEYS,
        storage,
        storageKey: VEHICLE_DRAFT_STORAGE_KEY,
      })
      return corrected
    })
  }

  /** Limpar é o formulário em branco de novo — e o rascunho vai junto, senão ele voltaria sozinho. */
  function clear(): void {
    setFeedbackKey(null)
    clearFormDraft({ storage, storageKey: VEHICLE_DRAFT_STORAGE_KEY })
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

  return { clear, feedbackKey, isSaving, patch, state, submit }
}
