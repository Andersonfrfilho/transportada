/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  clearFormDraft,
  readFormDraft,
  resolveFormDraftStorage,
  writeFormDraft,
} from '@/modules/shared/formDraft.service'

import { DRIVER_FORM_KEYS } from '../shared/fleet.constant'

import { toDriverCoverageEntries, type FleetDriverCoverage } from '../shared/driverCoverage.service'
import type {
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetDriverVehicleLink,
  FleetDriverVersionInput,
  FleetReplaceDriverRegionsInput,
  FleetReplaceDriverVehiclesInput,
} from '../shared/fleet.types'
import {
  shouldReplaceDriverVehicles,
  toSelectedVehicleIds,
  toggleVehicleSelection,
} from '../shared/driverVehicles.service'
import { resolveFleetFeedbackKey } from '../shared/fleetFeedback.service'
import {
  createDriverDraft,
  toDriverBody,
  toDriverCreateBody,
  toDriverFormState,
} from '../shared/fleetForm.service'
import { useDriverCoverage, type DriverCoverageController } from './useDriverCoverage.hook'

type UseDriverFormInput = Readonly<{
  driver?: FleetDriverDetail
  onCreate: (body: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  /** O 409 de colisão tem campo dono; quem o ancora lá é o controlador de unicidade da tela. */
  onSaveError?: (error: unknown) => void
  /** Quem abriu a ficha de fora precisa da versão gravada — é dela que o veículo tira o dono. */
  onSaved?: (driver: FleetDriverDetail) => void
  /** Ficha aberta em diálogo tem rascunho próprio: ela nasce de outra tela e some com ela. */
  storageKey?: string
  regions?: Readonly<{
    coverage: readonly FleetDriverCoverage[]
    replace: (input: FleetReplaceDriverRegionsInput) => Promise<unknown>
  }>
  vehicles?: Readonly<{
    isReady?: boolean
    links: readonly FleetDriverVehicleLink[]
    replace: (input: FleetReplaceDriverVehiclesInput) => Promise<unknown>
  }>
}>

const DRIVER_DRAFT_STORAGE_KEY = 'transportada.fleet.driver-draft'

export type DriverFormController = Readonly<{
  clear: () => void
  coverage: DriverCoverageController
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetDriverFormState>) => void
  selectedVehicleIds: readonly string[]
  setVehicles: (vehicleIds: readonly string[]) => void
  state: FleetDriverFormState
  submit: () => Promise<void>
  toggleVehicle: (vehicleId: string) => void
}>

export function useDriverForm(input: UseDriverFormInput): DriverFormController {
  // O rascunho é do cadastro novo: sobre ficha carregada ele apagaria o que está gravado
  const storage = input.driver === undefined ? resolveFormDraftStorage() : null
  const storageKey = input.storageKey ?? DRIVER_DRAFT_STORAGE_KEY
  const [state, setState] = useState<FleetDriverFormState>(() =>
    input.driver === undefined
      ? createDriverDraft(
          readFormDraft({
            fields: DRIVER_FORM_KEYS,
            storage,
            storageKey,
          }),
        )
      : toDriverFormState(input.driver),
  )
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [selection, setSelection] = useState<null | readonly string[]>(null)
  const { driver, onCreate, onSaveError, onSaved, onUpdate, regions, vehicles } = input
  // `null` significa "o operador ainda não mexeu": a marcação acompanha os vínculos que chegarem.
  const selectedVehicleIds = selection ?? toSelectedVehicleIds(vehicles?.links ?? [])
  const coverage = useDriverCoverage({
    onChange: () => setFeedbackKey(null),
    saved: regions?.coverage ?? [],
  })

  function patch(values: Partial<FleetDriverFormState>): void {
    setFeedbackKey(null)
    setState((previous) => {
      const next = { ...previous, ...values }
      writeFormDraft({
        draft: next,
        fields: DRIVER_FORM_KEYS,
        storage,
        storageKey,
      })
      return next
    })
  }

  /** Limpar é o formulário em branco de novo — e o rascunho vai junto, senão ele voltaria sozinho. */
  function clear(): void {
    setFeedbackKey(null)
    setSelection([])
    coverage.clear()
    clearFormDraft({ storage, storageKey })
    setState(createDriverDraft())
  }

  function setVehicles(vehicleIds: readonly string[]): void {
    setFeedbackKey(null)
    setSelection(vehicleIds)
  }

  function toggleVehicle(vehicleId: string): void {
    setFeedbackKey(null)
    setSelection(toggleVehicleSelection({ selected: selectedVehicleIds, vehicleId }))
  }

  async function submit(): Promise<void> {
    setIsSaving(true)
    try {
      // O vínculo não é campo do formulário: na edição quem o reenvia é a ficha carregada
      const saved = await (driver === undefined
        ? onCreate(toDriverCreateBody(state))
        : onUpdate({
            ...toDriverBody(state),
            driverId: driver.id,
            expectedVersion: driver.version,
            membershipId: driver.membershipId,
            status: driver.status,
          }))
      if (
        vehicles !== undefined &&
        shouldReplaceDriverVehicles({
          hasOperatorChoice: selection !== null,
          isReady: vehicles.isReady !== false,
        })
      ) {
        await vehicles.replace({ driverId: saved.id, vehicleIds: selectedVehicleIds })
      }
      if (regions !== undefined) {
        await regions.replace({
          driverId: saved.id,
          entries: toDriverCoverageEntries(coverage.entries),
        })
      }
      clearFormDraft({ storage, storageKey })
      setFeedbackKey('saved')
      onSaved?.(saved)
    } catch (error) {
      onSaveError?.(error)
      setFeedbackKey(resolveFleetFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    clear,
    coverage,
    feedbackKey,
    isSaving,
    patch,
    selectedVehicleIds,
    setVehicles,
    state,
    submit,
    toggleVehicle,
  }
}
