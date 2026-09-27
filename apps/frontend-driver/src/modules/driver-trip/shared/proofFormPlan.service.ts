/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/proofFormPlan.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CNPJ_PATTERN,
  CPF_PATTERN,
  formatCnpj,
  formatCpf,
  normalizeTaxId,
} from '@/modules/shared/taxId.service'

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
  /**
   * Spec 207 (pedido do usuário, 25/09): o documento de quem recebeu aparece SEMPRE — `off` deixou
   * de esconder o campo, e passou a valer como "opcional" (mesmo `pendingField`/`missing` de
   * sempre). Só `fields.receiverDocument === 'required'` muda o rótulo e a pendência; a
   * configuração nunca mais controla se o campo renderiza.
   */
  rendersReceiverDocument: true
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
    rendersReceiverDocument: true,
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
 * Spec 207 (pedido do usuário, 25/09): quem recebeu pode assinar com CPF, CNPJ (representante de
 * pessoa jurídica) ou RG — e o RG varia de formato por estado (comprimento, com ou sem letra do
 * dígito verificador, ex.: "12.345.678-9" em SP). CPF (11 dígitos) e CNPJ (12 alfanuméricos + 2
 * dígitos) são os dois formatos FIXOS que o servidor reconhece (`delivery-proof.schema.ts`,
 * `TAX_ID_PATTERN`) — só eles ganham máscara. Fora dos dois formatos completos, forçar uma máscara
 * arbitrária mascararia (literalmente) um RG válido como se fosse um CPF pela metade — o campo
 * aceita dígito e letra exatamente como digitado (só maiúsculo e sem separador), sem agrupar nada.
 *
 * O campo **nunca** leva `inputMode="numeric"`: o CNPJ tem letra desde 01/07/2026 e o RG também
 * pode ter (dígito verificador), e o teclado numérico do celular esconde as duas.
 */
export function maskReceiverDocument(value: string): string {
  const canonical = normalizeTaxId(value)
  if (CPF_PATTERN.test(canonical)) return formatCpf(canonical)
  if (CNPJ_PATTERN.test(canonical)) return formatCnpj(canonical)
  return canonical
}

export function canonicalReceiverDocument(value: string): string {
  return normalizeTaxId(value)
}

/**
 * O servidor só aceita o documento na forma CPF ou CNPJ (`parseReceiverDocument`,
 * `TAX_ID_PATTERN`) — qualquer outro formato (RG) responde 400 e derruba o multipart inteiro,
 * levando a foto/assinatura junto. Spec 203 promete "nunca trava a foto": o RG fica só no
 * aparelho, nunca sobe.
 */
function isSendableReceiverDocument(canonical: string): boolean {
  return CPF_PATTERN.test(canonical) || CNPJ_PATTERN.test(canonical)
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
  const canonicalDocument = canonicalReceiverDocument(input.receiverDocument)
  /** RG (fora de CPF/CNPJ) fica só no aparelho — nunca sobe (spec 203/207, ver isSendableReceiverDocument). */
  const receiverDocument = isSendableReceiverDocument(canonicalDocument) ? canonicalDocument : ''

  return {
    ...(receiverName === '' ? {} : { receiverName }),
    ...(receiverDocument === '' ? {} : { receiverDocument }),
    ...(receivedBy === '' ? {} : { receivedBy }),
    ...(receivedBy === '' || receivedByDetail === '' ? {} : { receivedByDetail }),
  }
}

/**
 * Pedido do usuário (25/09, spec 207): a lista completa de pendências para o botão "Concluir" —
 * junta o que falta do comprovante (foto, assinatura, nome, documento) com o que falta de quem
 * recebeu, sem duplicar chave (`receivedBy` só existe num dos dois). Nunca bloqueia (spec 203);
 * lista vazia é o sinal de que dá para concluir sem perguntar nada.
 */
export function listAllPendingFields(input: {
  readonly plan: ProofFormPlan
  readonly values: ProofFormValues & Readonly<{ receivedBy: string; receivedByDetail: string }>
}): readonly (ProofFieldKey | ReceiverFieldKey)[] {
  return [
    ...listMissingProofFields({ plan: input.plan, values: input.values }),
    ...listPendingReceiverFields({ plan: input.plan, values: input.values }),
  ]
}
