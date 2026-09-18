/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { SelectOption } from '@/components/ui/select'

import { toTripDocumentLabelSource } from './fieldDeliveryDocument.service'
import type {
  FieldDeliveryCapturedPhoto,
  FieldDeliveryWizardDocument,
} from './fieldDeliveryWizard.service'
import { tripDocumentLabel } from './tripDocument.service'

/**
 * Spec 156 T16: a nota no seletor da conferência é "número/série" com o destinatário por baixo —
 * nunca só o destinatário (dez notas do mesmo mercado viravam dez linhas iguais) nem o id interno.
 */
export function toFieldDeliveryTargetOption(document: FieldDeliveryWizardDocument): SelectOption {
  const label = tripDocumentLabel(toTripDocumentLabelSource(document))
  return document.recipientName === ''
    ? { label, value: document.documentId }
    : { description: document.recipientName, label, value: document.documentId }
}

/** "9000/1 · Mercado Bom Preço" — a mesma nota, numa linha só, para frases corridas. */
export function formatFieldDeliveryDocumentName(document: FieldDeliveryWizardDocument): string {
  const label = tripDocumentLabel(toTripDocumentLabelSource(document))
  return document.recipientName === '' ? label : `${label} · ${document.recipientName}`
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/u, '')
  return stripped === '' ? digits : stripped
}

/** O número impresso lido pelo OCR como o escritório escreve: "9000/1", não "000009000/1". */
export function formatCanhotoOcrNumber(
  suggestion: NonNullable<FieldDeliveryCapturedPhoto['ocrSuggestion']>,
): string {
  const number = stripLeadingZeros(suggestion.number)
  return suggestion.series === null ? number : `${number}/${stripLeadingZeros(suggestion.series)}`
}

export type FieldDeliveryIdentificationMessage =
  | 'matched'
  | 'ocrSuggested'
  | 'otherSelected'
  | 'unreadable'

/**
 * A frase da conferência. A sugestão do OCR não é "canhoto conferido": o código de barras não foi
 * lido, e dizer que a nota foi conferida contradiz a ADR-0067 §4 — a pessoa ainda precisa olhar.
 */
export function resolveFieldDeliveryIdentificationMessage(
  capture: FieldDeliveryCapturedPhoto,
): FieldDeliveryIdentificationMessage {
  if (capture.ocrSuggestion !== undefined) return 'ocrSuggested'
  const { status } = capture.identification
  if (status === 'matched' || status === 'otherSelected') return status
  return 'unreadable'
}

/**
 * Onde o foco entra na conferência: só o código de barras que bateu com a nota esperada deixa o
 * "Confirmar" pronto para o Enter. Outra nota, sugestão do OCR ou leitura falha levam o foco ao
 * seletor da nota — é ali que a pessoa precisa decidir, e um Enter distraído não grava nada.
 */
export function resolveFieldDeliveryReviewFocus(
  capture: FieldDeliveryCapturedPhoto,
): 'confirm' | 'target' {
  return resolveFieldDeliveryIdentificationMessage(capture) === 'matched' ? 'confirm' : 'target'
}
