/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import type { DriverDeliveryProofSettings, ProofFieldRequirement } from './driverTrip.types'

/**
 * Spec 082 D4/T053: o formulário do comprovante é dirigido pela configuração que vem no snapshot.
 * `off` não renderiza, `required` bloqueia o envio com mensagem no campo, `optional` fica de fora
 * do bloqueio. A regra mora aqui, não no componente (ADR-0045 §1).
 */
export const DEFAULT_PROOF_SETTINGS: DriverDeliveryProofSettings = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

export type ProofFormPlan = Readonly<{
  fields: DriverDeliveryProofSettings
  rendersPhoto: boolean
  rendersReceiverDocument: boolean
  rendersReceiverName: boolean
  rendersSignature: boolean
}>

export function resolveProofFormPlan(settings: DriverDeliveryProofSettings | null): ProofFormPlan {
  const fields = settings ?? DEFAULT_PROOF_SETTINGS
  return {
    fields,
    rendersPhoto: fields.photo !== 'off',
    rendersReceiverDocument: fields.receiverDocument !== 'off',
    rendersReceiverName: fields.receiverName !== 'off',
    rendersSignature: fields.signature !== 'off',
  }
}

export type ProofFormValues = Readonly<{
  hasPhoto: boolean
  hasSignature: boolean
  receiverDocument: string
  receiverName: string
}>

export type ProofFieldKey = keyof DriverDeliveryProofSettings

function isMissing(input: {
  readonly filled: boolean
  readonly requirement: ProofFieldRequirement
}): boolean {
  return input.requirement === 'required' && !input.filled
}

/** Todos os campos recusados de uma vez, nunca só o primeiro (web.md §11). */
export function listMissingProofFields(input: {
  readonly plan: ProofFormPlan
  readonly values: ProofFormValues
}): readonly ProofFieldKey[] {
  const missing: ProofFieldKey[] = []
  const { fields } = input.plan
  if (
    isMissing({ filled: input.values.receiverName.trim() !== '', requirement: fields.receiverName })
  )
    missing.push('receiverName')
  if (
    isMissing({
      filled: normalizeTaxId(input.values.receiverDocument) !== '',
      requirement: fields.receiverDocument,
    })
  )
    missing.push('receiverDocument')
  if (isMissing({ filled: input.values.hasSignature, requirement: fields.signature }))
    missing.push('signature')
  if (isMissing({ filled: input.values.hasPhoto, requirement: fields.photo })) missing.push('photo')
  return missing
}

/**
 * A máscara acompanha a digitação e a forma canônica é o que sobe (`shared/taxId.service`). O campo
 * **nunca** leva `inputMode="numeric"`: o CNPJ tem letra desde 01/07/2026, e o teclado numérico do
 * celular a esconde.
 */
export function maskReceiverDocument(value: string): string {
  const canonical = normalizeTaxId(value)
  return canonical === '' ? '' : formatTaxId(canonical)
}

export function canonicalReceiverDocument(value: string): string {
  return normalizeTaxId(value)
}
