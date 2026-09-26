/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/proofFormPlan.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import type { DriverDeliveryProofSettings, ProofFieldRequirement } from './driverTrip.types'
import { RECEIVED_BY_OPTIONS_REQUIRING_DETAIL } from './receivedBy.constant'

/**
 * Spec 082 D4/T053: o formulário do comprovante é dirigido pela configuração que vem no snapshot.
 * `off` não renderiza, `required` bloqueia o envio com mensagem no campo, `optional` fica de fora
 * do bloqueio. A regra mora aqui, não no componente (ADR-0045 §1).
 */
export const DEFAULT_PROOF_SETTINGS: DriverDeliveryProofSettings = {
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

export type ProofFormPlan = Readonly<{
  fields: DriverDeliveryProofSettings
  rendersPhoto: boolean
  /** Spec 193 R2: `receivedBy` renderiza sempre que não estiver `off` — `required` nunca bloqueia. */
  rendersReceivedBy: boolean
  rendersReceiverDocument: boolean
  rendersReceiverName: boolean
  /** Spec 193 D14: "O próprio cliente recebeu" só existe quando o nome renderiza. */
  rendersRecipientShortcut: boolean
  rendersSignature: boolean
}>

export function resolveProofFormPlan(settings: DriverDeliveryProofSettings | null): ProofFormPlan {
  const fields = settings ?? DEFAULT_PROOF_SETTINGS
  return {
    fields,
    rendersPhoto: fields.photo !== 'off',
    rendersReceivedBy: fields.receivedBy !== 'off',
    rendersReceiverDocument: fields.receiverDocument !== 'off',
    rendersReceiverName: fields.receiverName !== 'off',
    rendersRecipientShortcut: fields.receiverName !== 'off',
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

export type ReceiverFieldKey = 'receivedBy' | 'receivedByDetail'

/**
 * Spec 193 R2/C1: pendência **visível e nunca bloqueante** — o `receivedBy` faltando em `required`,
 * e o detalhe faltando em `other`/`other_relative` (D1). Não entra em `blockedByFields` nem em
 * `listMissingProofFields`: a foto e o resto do comprovante seguem sem depender disto.
 */
export function listPendingReceiverFields(input: {
  readonly plan: ProofFormPlan
  readonly values: Readonly<{ receivedBy: string; receivedByDetail: string }>
}): readonly ReceiverFieldKey[] {
  const missing: ReceiverFieldKey[] = []
  const { receivedBy, receivedByDetail } = input.values
  if (input.plan.fields.receivedBy === 'required' && receivedBy.trim() === '') {
    missing.push('receivedBy')
  }
  if (
    (RECEIVED_BY_OPTIONS_REQUIRING_DETAIL as readonly string[]).includes(receivedBy) &&
    receivedByDetail.trim() === ''
  ) {
    missing.push('receivedByDetail')
  }
  return missing
}

/**
 * Spec 193 D14: "O próprio cliente recebeu" marca `recipient` (só quando o campo renderiza) e
 * preenche o nome com `recipientDisplayName` — o PJ/PF do foco e da seleção é decidido pela tela,
 * que sabe se o destinatário é empresa.
 */
export function applyRecipientShortcut(input: {
  readonly plan: ProofFormPlan
  readonly recipientDisplayName: string
}): Readonly<{ receivedBy?: 'recipient'; receiverName: string }> {
  return {
    ...(input.plan.rendersReceivedBy ? { receivedBy: 'recipient' as const } : {}),
    receiverName: input.recipientDisplayName,
  }
}

const CONTROL_CHARACTERS = /\p{Cc}/gu

function cleanText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '').trim()
}

export type ReceiverFieldsInput = Readonly<{
  receivedBy: string
  receivedByDetail: string
  receiverDocument: string
  receiverName: string
}>

export type ReceiverFields = Readonly<{
  receivedBy?: string
  receivedByDetail?: string
  receiverDocument?: string
  receiverName?: string
}>

/**
 * Spec 193 D2/D7: trim, sem caractere de controle (`\p{Cc}`), e o detalhe sem relação nunca sobe —
 * a mesma normalização vale para o anexo, a atualização tardia e o PATCH.
 */
export function buildReceiverFields(input: ReceiverFieldsInput): ReceiverFields {
  const receivedBy = cleanText(input.receivedBy)
  const receivedByDetail = cleanText(input.receivedByDetail)
  const receiverName = cleanText(input.receiverName)
  const receiverDocument = canonicalReceiverDocument(input.receiverDocument)

  return {
    ...(receiverName === '' ? {} : { receiverName }),
    ...(receiverDocument === '' ? {} : { receiverDocument }),
    ...(receivedBy === '' ? {} : { receivedBy }),
    ...(receivedBy === '' || receivedByDetail === '' ? {} : { receivedByDetail }),
  }
}
