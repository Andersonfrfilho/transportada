/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverOccurrenceTypesState,
  DriverTripDocument,
  DriverTripStop,
} from './driverTrip.types'
import type { OccurrenceNoticePreview } from './occurrenceNoticePreview.service'
import type { OccurrenceRegistrationHandlers } from './occurrenceDispatch.service'
import type {
  OccurrenceFieldVisibility,
  OccurrenceMissingField,
} from './occurrenceRequirements.service'
import type { OccurrenceSignatureState } from '../hooks/useOccurrenceSignature.hook'
import type { OccurrenceValuesForm } from '../hooks/useOccurrenceValues.hook'

/** O que acontece com a foto escolhida antes de ela entrar na fila. */
export type OccurrencePhotoState = 'failed' | 'idle' | 'reading' | 'too-large'

export type OccurrenceRegistrationFormParams = Readonly<{
  document: DriverTripDocument
  handlers: OccurrenceRegistrationHandlers
  occurrenceTypes: DriverOccurrenceTypesState
  stop: DriverTripStop
}>

export type OccurrenceRegistrationForm = Readonly<{
  canRegister: boolean
  description: string
  handleDescriptionChange: (description: string) => void
  handlePhotoRemove: () => void
  handlePhotoSelect: (file: File) => void
  /**
   * Registra pela rota do `flow` e diz se registrou: `false` é rascunho a que falta um campo
   * obrigatório — nada entrou na fila, e quem chamou não deve fechar o formulário.
   */
  handleRegister: () => boolean
  handleProductsToggle: () => void
  handleTypeSelect: (occurrenceTypeId: string) => void
  /** Spec 246: a nota inteira apontada — o snapshot não traz a lista de itens para apontar um. */
  hasProducts: boolean
  missingFields: readonly OccurrenceMissingField[]
  /** As fotos capturadas, na ordem; a primeira é a que a coluna antiga da API leva. */
  photos: readonly DriverOccurrencePhoto[]
  photoPreviewUrl: string | undefined
  photoState: OccurrencePhotoState
  /**
   * A prévia do aviso da parada — ausente quando o tipo não é de parada (o aviso da nota é outro).
   * `null` dentro dela é "este motivo não gera aviso", e a tela diz isso.
   */
  preview: Readonly<{ notice: OccurrenceNoticePreview | null }> | undefined
  selectedType: DriverOccurrenceType | undefined
  signature: OccurrenceSignatureState
  types: readonly DriverOccurrenceType[]
  /** Spec 247: produtos marcados, quantidades, valor pago e número do documento. */
  valuesForm: OccurrenceValuesForm
  /** O que o tipo escolhido mostra: `off` não aparece, e só o que é pedido ocupa a tela. */
  visibility: OccurrenceFieldVisibility | undefined
}>
