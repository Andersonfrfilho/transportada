/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  useDocumentProductsQuery,
  useReceivingTypesQuery,
} from '../queries/useCargoOccurrences.query'
import type { CargoDocumentProduct, ReceivingOccurrenceType } from '../shared/cargoOccurrence.types'
import type { RegistrationRefusal } from '../shared/cargoReceivingRefusal.service'
import { useCargoFieldFeedback, type CargoFieldFeedback } from './useCargoFieldFeedback.hook'
import { useOccurrenceDraft, type OccurrenceDraftController } from './useOccurrenceDraft.hook'
import { useOccurrenceSubmission } from './useOccurrenceSubmission.hook'

export type CargoOccurrenceFormController = Readonly<{
  draft: OccurrenceDraftController
  errorCode: string | undefined
  feedback: CargoFieldFeedback
  isLoading: boolean
  isSubmitting: boolean
  loadFailed: boolean
  products: readonly CargoDocumentProduct[]
  refusal: RegistrationRefusal | undefined
  selectedType: ReceivingOccurrenceType | undefined
  submit: () => void
  types: readonly ReceivingOccurrenceType[]
}>

type CargoOccurrenceFormInput = Readonly<{
  arrivalId: string
  documentId: string
  onSaved: () => void
}>

const NO_TYPES: readonly ReceivingOccurrenceType[] = []
const NO_PRODUCTS: readonly CargoDocumentProduct[] = []

/** Editar um campo limpa o erro dele, e só o dele (`web.md` §11). */
function withFieldFeedback(
  input: Readonly<{ controller: OccurrenceDraftController; feedback: CargoFieldFeedback }>,
): OccurrenceDraftController {
  const { controller, feedback } = input
  return {
    ...controller,
    setItemQuantity: (change) => {
      controller.setItemQuantity(change)
      feedback.clearField('productQuantities')
    },
    setItemUnit: (change) => {
      controller.setItemUnit(change)
      feedback.clearField('productQuantities')
    },
    setNote: (note) => {
      controller.setNote(note)
      feedback.clearField('note')
    },
    setPhotoFile: (file) => {
      controller.setPhotoFile(file)
      feedback.clearField('file')
    },
    setTypeId: (typeId) => {
      controller.setTypeId(typeId)
      feedback.clearField('occurrenceTypeId')
    },
    toggleItem: (change) => {
      controller.toggleItem(change)
      feedback.clearField('productCodes')
    },
  }
}

/**
 * O formulário da avaria na nota: tipo e itens vêm do servidor, a validação espelha a dele, e a chave de
 * idempotência é UMA por tentativa — o mesmo envio repetido a reaproveita, e conteúdo novo ganha outra.
 */
export function useCargoOccurrenceForm(
  input: CargoOccurrenceFormInput,
): CargoOccurrenceFormController {
  const { arrivalId, documentId } = input
  const feedback = useCargoFieldFeedback()
  const draftController = withFieldFeedback({ controller: useOccurrenceDraft(), feedback })
  const typesQuery = useReceivingTypesQuery({ isEnabled: true })
  const productsQuery = useDocumentProductsQuery({ arrivalId, documentId })
  const submission = useOccurrenceSubmission({
    arrivalId,
    documentId,
    feedback,
    onSaved: input.onSaved,
  })
  const types = typesQuery.data ?? NO_TYPES
  const selectedType = types.find((type) => type.id === draftController.draft.typeId)

  return {
    draft: draftController,
    errorCode: submission.errorCode,
    feedback,
    isLoading: typesQuery.isLoading || productsQuery.isLoading,
    isSubmitting: submission.isSubmitting,
    loadFailed: typesQuery.isError || productsQuery.isError,
    products: productsQuery.data ?? NO_PRODUCTS,
    refusal: submission.refusal,
    selectedType,
    submit: () => submission.submit({ draft: draftController.draft, type: selectedType }),
    types,
  }
}
